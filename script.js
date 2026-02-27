document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // AUTH WALL — Block entire app until logged in
    // ==========================================
    const authWall        = document.getElementById('authWall');
    const wallStep1       = document.getElementById('wall-step-1');
    const wallStep3       = document.getElementById('wall-step-3');
    const wallEmailForm   = document.getElementById('wallEmailForm');
    const wallEmailInput  = document.getElementById('wallEmailInput');
    const wallProfileForm = document.getElementById('wallProfileForm');
    const navGreeting     = document.getElementById('nav-user-greeting');
    const signOutBtn      = document.getElementById('signOutBtn');
    const navLoginBtn     = document.getElementById('navLoginBtn');

    let wallEmail = '';

    // OTP logic removed.

    function dismissWall(user) {
        // Save session
        localStorage.setItem('hormonyaUser', JSON.stringify(user));
        // Hide wall with animation
        if (authWall) { authWall.style.opacity = '0'; setTimeout(() => authWall.style.display = 'none', 400); }
        // Update nav
        if (navGreeting) { navGreeting.textContent = `👋 Hi, ${user.name || 'User'}`; navGreeting.style.display = 'inline'; }
        if (signOutBtn) signOutBtn.style.display = 'inline-flex';
        if (navLoginBtn) navLoginBtn.style.display = 'none';

        // Load saved cycles for this user
        loadCycles();
    }

    function showWall() {
        if (authWall) { authWall.style.display = 'flex'; authWall.style.opacity = '1'; }
    }

    // Check session on load
    const savedUser = localStorage.getItem('hormonyaUser');
    if (savedUser) {
        dismissWall(JSON.parse(savedUser));
    } else {
        showWall();
    }

    // Sign Out
    if (signOutBtn) {
        signOutBtn.addEventListener('click', () => {
            localStorage.removeItem('hormonyaUser');
            location.reload();
        });
    }

    // Nav login button (for already-logged-in users who signed out, or re-login)
    if (navLoginBtn) {
        navLoginBtn.addEventListener('click', () => showWall());
    }

    // STEP 1: Email Login
    if (wallEmailForm) {
        wallEmailForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('wallLoginBtn');
            wallEmail = wallEmailInput.value.trim().toLowerCase();
            
            if (btn) { btn.textContent = 'Logging in...'; btn.disabled = true; }

            try {
                const res = await fetch('/api/login-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: wallEmail })
                });
                const data = await res.json();
                if (btn) { btn.textContent = 'Continue →'; btn.disabled = false; }

                if (data.success) {
                    if (data.isNewUser) {
                        // New user: show profile form
                        wallStep1.style.display = 'none';
                        wallStep3.style.display = 'block';
                        document.getElementById('wall-name')?.focus();
                    } else {
                        // Existing user: go straight in
                        dismissWall({ email: wallEmail, ...data.user });
                    }
                } else {
                    alert(data.message || 'Error logging in.');
                }
            } catch (err) {
                if (btn) { btn.textContent = 'Continue →'; btn.disabled = false; }
                alert('Cannot connect to server. Visit http://localhost:3000');
            }
        });
    }

    // STEP 3: Save Profile (new users only)
    if (wallProfileForm) {
        wallProfileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name   = document.getElementById('wall-name')?.value.trim();
            const age    = document.getElementById('wall-age')?.value;
            const gender = document.getElementById('wall-gender')?.value;
            const height = document.getElementById('wall-height')?.value;
            const weight = document.getElementById('wall-weight')?.value;
            const bmi    = (height && weight) ? (weight / ((height/100) ** 2)).toFixed(1) : null;

            try {
                await fetch('/api/save-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: wallEmail, name, age, gender, height, weight, bmi })
                });
            } catch(_) {}

            dismissWall({ email: wallEmail, name, age, gender, height, weight, bmi });
        });
    }

    // Resend OTP logic removed.

    // ==========================================
    // NAVBAR SCROLL EFFECT
    // ==========================================
    const navbar = document.querySelector('.navbar');
    if (navbar) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                navbar.style.background = 'rgba(255, 255, 255, 0.95)';
                navbar.style.boxShadow = '0 4px 20px rgba(0,0,0,0.05)';
                navbar.style.padding = '15px 0';
            } else {
                navbar.style.background = 'rgba(255, 255, 255, 0.8)';
                navbar.style.boxShadow = 'none';
                navbar.style.padding = '20px 0';
            }
        });
    }

    // Mobile Menu Toggle
    const mobileBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    if (mobileBtn && navLinks) {
        mobileBtn.addEventListener('click', () => {
            const isVisible = navLinks.style.display === 'flex';
            navLinks.style.display = isVisible ? 'none' : 'flex';
            navLinks.style.flexDirection = 'column';
            navLinks.style.position = 'absolute';
            navLinks.style.top = '100%';
            navLinks.style.left = '0';
            navLinks.style.width = '100%';
            navLinks.style.background = 'rgba(255,255,255,0.98)';
            navLinks.style.padding = '20px';
            navLinks.style.zIndex = '1000';
        });
    }

    // Smooth Scrolling
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                e.preventDefault();
                const offset = 80;
                const offsetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - offset;
                window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
            }
        });
    });

    // ==========================================
    // REAL-TIME CALENDAR TRACKER
    // ==========================================
    const calendarDays = document.getElementById('calendarDays');
    const monthYearDisplay = document.getElementById('monthYear');
    const prevMonthBtn = document.getElementById('prevMonth');
    const nextMonthBtn = document.getElementById('nextMonth');

    // Start calendar on today's real date
    let currentDate = new Date();
    const cycleLength = 28;
    let selectedCycleStart = null;
    let predictedCycleStart = null;

    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

    // REAL-TIME CLOCK
    function updateClock() {
        const now = new Date();
        const clockEl = document.getElementById('realTimeClock');
        if (clockEl) {
            clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
    }
    setInterval(updateClock, 1000);
    updateClock();

    async function saveCycleDate(startDate) {
        const user = JSON.parse(localStorage.getItem('hormonyaUser'));
        if (!user || !user.email) return;
        try {
            await fetch('/api/save-cycle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: user.email, startDate })
            });
        } catch(err) { console.error('Error saving cycle:', err); }
    }

    async function loadCycles() {
        const user = JSON.parse(localStorage.getItem('hormonyaUser'));
        if (!user || !user.email) return;
        try {
            const res = await fetch(`/api/get-cycles?email=${encodeURIComponent(user.email)}`);
            const data = await res.json();
            if (data.success && data.cycles.length > 0) {
                selectedCycleStart = data.cycles[0].start_date;
                const [y, m, d] = selectedCycleStart.split('-').map(Number);
                const dateObj = new Date(y, m - 1, d);
                dateObj.setDate(dateObj.getDate() + cycleLength);
                predictedCycleStart = `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2,'0')}-${String(dateObj.getDate()).padStart(2,'0')}`;
                renderCalendar();
            }
        } catch(err) { console.error('Error loading cycles:', err); }
    }

    function renderCalendar() {
        if (!calendarDays || !monthYearDisplay) return;
        calendarDays.innerHTML = '';

        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const today = new Date();

        monthYearDisplay.textContent = `${monthNames[month]} ${year}`;

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Empty cells before first day
        for (let i = 0; i < firstDay; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.classList.add('day-cell', 'empty');
            calendarDays.appendChild(emptyCell);
        }

        // Day cells
        for (let day = 1; day <= daysInMonth; day++) {
            const dayCell = document.createElement('div');
            dayCell.classList.add('day-cell');
            dayCell.textContent = day;

            const cellDateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            dayCell.dataset.date = cellDateStr;

            // Highlight today
            if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
                dayCell.classList.add('today');
                dayCell.style.background = 'rgba(236,72,153,0.12)';
                dayCell.style.fontWeight = '700';
                dayCell.style.borderRadius = '50%';
            }

            if (selectedCycleStart === cellDateStr) {
                dayCell.classList.add('selected-cycle');
                dayCell.innerHTML = `${day}<span style="font-size:0.7rem;display:block;line-height:1">💧</span>`;
            }
            // Highlight predicted cycle with RED blood drop
            if (predictedCycleStart === cellDateStr) {
                dayCell.classList.add('predicted-cycle');
                dayCell.innerHTML = `${day}<span style="font-size:0.75rem;display:block;line-height:1">🩸</span>`;
                dayCell.title = 'Predicted next cycle';
            }

            dayCell.addEventListener('click', () => {
                const user = JSON.parse(localStorage.getItem('hormonyaUser'));
                if (!user) {
                    alert('Please sign in first to track your cycle.');
                    showWall();
                    return;
                }
                selectedCycleStart = cellDateStr;
                const dateObj = new Date(year, month, day);
                dateObj.setDate(dateObj.getDate() + cycleLength);
                predictedCycleStart = `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2,'0')}-${String(dateObj.getDate()).padStart(2,'0')}`;
                saveCycleDate(selectedCycleStart);
                renderCalendar();
                
                // Show a small success feedback
                const hint = document.querySelector('.calendar-hint');
                if (hint) {
                    const original = hint.textContent;
                    hint.textContent = '✅ Cycle date saved successfully!';
                    hint.style.color = '#BE185D';
                    setTimeout(() => { hint.textContent = original; hint.style.color = ''; }, 3000);
                }
            });

            calendarDays.appendChild(dayCell);
        }
    }

    if (prevMonthBtn) prevMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth()-1); renderCalendar(); });
    if (nextMonthBtn) nextMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth()+1); renderCalendar(); });
    
    // Reset calendar functionality
    const resetCalendarBtn = document.getElementById('resetCalendar');
    if (resetCalendarBtn) {
        resetCalendarBtn.addEventListener('click', () => {
            selectedCycleStart = null;
            predictedCycleStart = null;
            renderCalendar();
        });
    }

    renderCalendar();


    // ==========================================
    // AI CHATBOT
    // ==========================================
    const chatToggle = document.getElementById('chatToggle');
    const chatWindow = document.getElementById('chatWindow');
    const closeChat = document.getElementById('closeChat');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const chatMessages = document.getElementById('chatMessages');

    if (chatToggle && chatWindow) {
        chatToggle.addEventListener('click', () => {
            chatWindow.classList.toggle('closed');
            if (!chatWindow.classList.contains('closed') && chatInput) {
                setTimeout(() => chatInput.focus(), 300);
            }
        });
    }
    if (closeChat && chatWindow) closeChat.addEventListener('click', () => chatWindow.classList.add('closed'));

    function addMessage(text, sender) {
        if (!chatMessages) return;
        const msgDiv = document.createElement('div');
        msgDiv.classList.add('message', sender);
        let formattedText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
        msgDiv.innerHTML = `<p>${formattedText}</p>`;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // File upload for medical reports
    const chatFileInput = document.getElementById('chatFileInput');
    const chatAttachBtn = document.getElementById('chatAttachBtn');
    let selectedFile = null;

    if (chatAttachBtn && chatFileInput && chatInput) {
        chatAttachBtn.addEventListener('click', () => chatFileInput.click());
        chatFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                selectedFile = e.target.files[0];
                chatAttachBtn.style.color = 'var(--primary-pink)';
                addMessage(`📎 Attached: ${selectedFile.name}`, 'user');
                chatInput.placeholder = 'Ask a question about this report...';
                chatInput.focus();
            }
        });
    }

    // Clear Chat
    const chatClearBtn = document.getElementById('chat-clear-btn');
    if (chatClearBtn && chatMessages && chatWindow) {
        chatClearBtn.addEventListener('click', () => {
            if (confirm('Clear chat history?')) {
                const first = chatMessages.firstElementChild;
                chatMessages.innerHTML = '';
                if (first) chatMessages.appendChild(first);
                chatWindow.classList.add('closed');
            }
        });
    }


    async function generateAIResponse(userMessage) {
        if (!chatMessages) return '';
        const typingId = 'typing-' + Date.now();
        const typingDiv = document.createElement('div');
        typingDiv.classList.add('message', 'bot');
        typingDiv.id = typingId;
        typingDiv.innerHTML = '<p><em>Thinking...</em></p>';
        chatMessages.appendChild(typingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        try {
            const formData = new FormData();
            formData.append('message', userMessage || 'Please analyze this medical report.');
            if (selectedFile) formData.append('receipt', selectedFile);

            const response = await fetch('/api/chat', { method: 'POST', body: formData });
            document.getElementById(typingId)?.remove();

            if (!response.ok) return "I'm having trouble connecting to the server right now.";

            const data = await response.json();
            selectedFile = null;
            if (chatAttachBtn) chatAttachBtn.style.color = 'var(--text-muted)';
            if (chatFileInput) chatFileInput.value = '';
            if (chatInput) chatInput.placeholder = 'Ask about symptoms, PCOS, or upload a report...';
            return data.reply;

        } catch (err) {
            document.getElementById(typingId)?.remove();
            return 'A network error occurred. Is the server running? Try http://localhost:3000';
        }
    }

    async function handleSend() {
        if (!chatInput) return;
        const text = chatInput.value.trim();
        if (text || selectedFile) {
            if (text) addMessage(text, 'user');
            chatInput.value = '';
            const reply = await generateAIResponse(text);
            if (reply) addMessage(reply, 'bot');
        }
    }

    if (sendBtn) sendBtn.addEventListener('click', handleSend);
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSend();
        });
    }



    // ==========================================
    // EDUCATION MODALS
    // ==========================================
    const eduTriggers = document.querySelectorAll('.edu-trigger');
    const closeEduModals = document.querySelectorAll('.close-edu-modal');

    eduTriggers.forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = trigger.getAttribute('data-target');
            const modal = document.getElementById(targetId);
            if (modal) modal.classList.add('active');
        });
    });

    closeEduModals.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal-overlay');
            if (modal) modal.classList.remove('active');
        });
    });

});
