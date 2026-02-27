require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
// TWILIO REMOVED - Using Email Login now.

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Request Logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Configure Multer for in-memory file uploads (for sending to Gemini)
const upload = multer({ storage: multer.memoryStorage() });

// Initialize Gemini API
const apiKey = process.env.GEMINI_API_KEY;
// If no key is provided, the chatbot will return a friendly error message instead of crashing
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
const model = genAI ? genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" }) : null;

// Database Setup (SQLite)
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        // Create tables if they don't exist
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                age INTEGER,
                gender TEXT,
                height REAL,
                weight REAL,
                bmi REAL
            )`);

            // Migration: Ensure 'email' column exists
            db.all(`PRAGMA table_info(users)`, (err, rows) => {
                if (err) return console.error('Error checking schema:', err.message);
                const hasEmail = rows.some(r => r.name === 'email');
                if (!hasEmail) {
                    console.log('🏁 Migrating database: Adding email column...');
                    db.run(`ALTER TABLE users ADD COLUMN email TEXT`, (err) => {
                        if (err) {
                            console.error('Migration error:', err.message);
                        }
                    });
                }
            });

            db.run(`CREATE TABLE IF NOT EXISTS cycles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                start_date TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`);
        });
    }
});

// ==========================================
// ROUTES: AUTHENTICATION (EMAIL)
// ==========================================

// Login with Email (Simplified, no OTP)
app.post('/api/login-email', (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ success: false, message: "Email is required." });
    }

    console.log(`📧 Login attempt for: ${email}`);

    // Check if user exists
    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, row) => {
        if (err) {
            console.error(`❌ DB Error for ${email}:`, err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
        
        if (!row) {
            console.log(`👤 New user detected: ${email}`);
            // Create a new user record immediately
            db.run(`INSERT INTO users (email) VALUES (?)`, [email], function(err) {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ 
                    success: true, 
                    isNewUser: true, 
                    userId: this.lastID, 
                    email: email, 
                    message: "New account created!" 
                });
            });
        } else {
            console.log(`👋 Welcome back: ${email}`);
            res.json({ 
                success: true, 
                isNewUser: false, 
                user: row, 
                message: "Login successful!" 
            });
        }
    });
});

// 3. Save/Update Profile
app.post('/api/save-profile', (req, res) => {
    const { email, name, age, gender, height, weight, bmi } = req.body;
    
    if (!email) {
        return res.status(400).json({ success: false, message: "Email is required." });
    }

    db.run(
        `UPDATE users SET name = ?, age = ?, gender = ?, height = ?, weight = ?, bmi = ? WHERE email = ?`,
        [name, age, gender, height, weight, bmi, email],
        function(err) {
            if (err) {
                console.error('Database update error:', err.message);
                return res.status(500).json({ success: false, error: err.message });
            }
            res.json({ success: true, message: "Profile updated successfully!" });
        }
    );
});

// 4. Save Cycle Date
app.post('/api/save-cycle', (req, res) => {
    const { email, startDate } = req.body;
    if (!email || !startDate) return res.status(400).json({ success: false, message: "Missing data." });

    db.get(`SELECT id FROM users WHERE email = ?`, [email], (err, user) => {
        if (err || !user) return res.status(404).json({ success: false, message: "User not found." });

        db.run(`INSERT INTO cycles (user_id, start_date) VALUES (?, ?)`, [user.id, startDate], function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, message: "Cycle saved!" });
        });
    });
});

// 5. Get Cycles
app.get('/api/get-cycles', (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ success: false, message: "Email required." });

    db.get(`SELECT id FROM users WHERE email = ?`, [email], (err, user) => {
        if (err || !user) return res.status(404).json({ success: false, message: "User not found." });

        db.all(`SELECT start_date FROM cycles WHERE user_id = ? ORDER BY start_date DESC`, [user.id], (err, rows) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, cycles: rows });
        });
    });
});


// ==========================================
// ROUTES: AI CHATBOT
// ==========================================

const systemPrompt = "You are Hormonya AI, a compassionate, informative expert in women's hormonal health, menstrual cycles, PCOS, and thyroid function. Respond accurately based on medical consensus, but remind users to consult a doctor. Keep responses concise (3-4 sentences max unless asked for a list), encouraging, and format important terms using markdown **bolding**.";

app.post('/api/chat', upload.single('receipt'), async (req, res) => {
    try {
        const message = req.body.message;
        const file = req.file;
        
        if (!model) {
            return res.json({ reply: "AI Chat is currently in **Demo Mode**. To enable actual AI responses, please add your `GEMINI_API_KEY` to the `.env` file! 🌸" });
        }

        if (!message && !file) {
            return res.status(400).json({ error: "Message or file is required." });
        }

        let result;
        
        if (file) {
            // Multimodal Request (Text + Image)
            const prompt = `${systemPrompt}\n\nUser Question/Request regarding the attached medical report: ${message}`;
            const imageParts = [
                {
                    inlineData: {
                        data: file.buffer.toString("base64"),
                        mimeType: file.mimetype
                    }
                }
            ];
            result = await model.generateContent([prompt, ...imageParts]);
        } else {
            // Text-only Request
            result = await model.generateContent(`${systemPrompt}\n\nUser Question: ${message}`);
        }

        const response = await result.response;
        const text = response.text();
        
        res.json({ reply: text });

    } catch (error) {
        console.error("Gemini API Error:", error);
        res.status(500).json({ error: "Failed to generate AI response." });
    }
});

// ==========================================
// SERVER START
// ==========================================
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
