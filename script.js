// script.js
let sessions = JSON.parse(localStorage.getItem('infotip_sessions')) || [];
let currentSessionId = null;

// Get API Key securely for purely static site or build-injected environment
const getApiKey = () => {
    let key = '';
    
    // 1. Try Vite / modern bundler injection if used later
    try {
        if (import.meta && import.meta.env && import.meta.env.OPENAI_API_KEY) {
            key = import.meta.env.OPENAI_API_KEY;
        }
    } catch(e) {}
    
    // 2. Try Node/Webpack injection if used later
    if (!key) {
        try {
            if (typeof process !== 'undefined' && process.env.OPENAI_API_KEY) {
                key = process.env.OPENAI_API_KEY;
            }
        } catch(e) {}
    }
    
    // 3. Fallback to localStorage for purely static Vercel deployments (since there's no build step)
    if (!key) {
        key = localStorage.getItem('infotip_openai_key') || '';
    }
    
    return key;
};

// Request API Key from user if missing (Needed for static SPA without backend)
const ensureApiKey = () => {
    let key = getApiKey();
    if (!key) {
        const userInput = prompt("InfoTip needs an OpenAI API Key to function.\n\nSince this is a static Vercel deployment without a backend, please enter your key below.\nIt will be securely saved in your browser's local storage.");
        if (userInput && userInput.trim()) {
            key = userInput.trim();
            localStorage.setItem('infotip_openai_key', key);
            showToast('API Key saved securely locally.', 'success');
        } else {
            showToast('API Key is required to chat.', 'error');
        }
    }
    return key;
};

// DOM Elements
const sidebar = document.getElementById('sidebar');
const openSidebarBtn = document.getElementById('open-sidebar');
const closeSidebarBtn = document.getElementById('close-sidebar');
const newChatBtn = document.getElementById('new-chat-btn');
const redactBtn = document.getElementById('redact-btn');
const exportBtn = document.getElementById('export-btn');
const historyList = document.getElementById('history-list');
const homeView = document.getElementById('home-view');
const chatView = document.getElementById('chat-view');
const startChattingBtn = document.getElementById('start-chatting-btn');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const toastContainer = document.getElementById('toast-container');

// Mobile Sidebar Toggle
openSidebarBtn.addEventListener('click', () => sidebar.classList.add('open'));
closeSidebarBtn.addEventListener('click', () => sidebar.classList.remove('open'));

// Auto-resize textarea
chatInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 200) + 'px';
    sendBtn.disabled = !this.value.trim();
});

// Toast Notification
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i> <span>${message}</span>`;
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Render History
function renderHistory() {
    historyList.innerHTML = '';
    sessions.sort((a, b) => b.updatedAt - a.updatedAt).forEach(session => {
        const li = document.createElement('li');
        li.className = `history-item ${session.id === currentSessionId ? 'active' : ''}`;
        li.textContent = session.title;
        li.onclick = () => loadSession(session.id);
        historyList.appendChild(li);
    });
}

function loadSession(id) {
    currentSessionId = id;
    homeView.classList.add('hidden');
    chatView.classList.remove('hidden');
    chatMessages.innerHTML = '';
    
    const session = sessions.find(s => s.id === id);
    if (session && session.messages) {
        session.messages.forEach(msg => {
            appendMessage(msg.role, msg.content, false);
        });
    }
    renderHistory();
    scrollToBottom();
    if (window.innerWidth <= 768) sidebar.classList.remove('open');
}

function createNewSession() {
    const newSession = {
        id: Date.now().toString(),
        title: 'New Chat',
        messages: [],
        updatedAt: Date.now()
    };
    sessions.push(newSession);
    saveSessions();
    loadSession(newSession.id);
}

function saveSessions() {
    localStorage.setItem('infotip_sessions', JSON.stringify(sessions));
}

function updateSessionTitle(id, content) {
    const session = sessions.find(s => s.id === id);
    if (session && session.messages.length === 1) {
        session.title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
        saveSessions();
        renderHistory();
    }
}

// Global Copy function for inline HTML onclick handlers
window.copyText = function(text) {
    // Decoding URI encoded text to preserve newlines correctly
    const decoded = decodeURIComponent(text);
    navigator.clipboard.writeText(decoded).then(() => showToast('Copied to clipboard'));
};

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendMessage(role, content, animate = false) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    
    // Parse markdown and sanitize HTML
    const parsedContent = DOMPurify.sanitize(marked.parse(content));
    
    // URL encode content so it safely passes into the HTML attribute
    const encodedContent = encodeURIComponent(content);
    
    msgDiv.innerHTML = `
        <div class="avatar">
            <i class="fas ${role === 'user' ? 'fa-user' : 'fa-robot'}"></i>
        </div>
        <div style="flex: 1; min-width: 0;">
            <div class="message-content">${parsedContent}</div>
            <div class="message-actions">
                <button class="action-icon" onclick="copyText('${encodedContent}')" title="Copy"><i class="fas fa-copy"></i> Copy</button>
            </div>
        </div>
    `;
    
    chatMessages.appendChild(msgDiv);
    scrollToBottom();
    return msgDiv.querySelector('.message-content');
}

// Handle Send
async function handleSend() {
    const content = chatInput.value.trim();
    if (!content) return;
    
    const apiKey = ensureApiKey();
    if (!apiKey) return;
    
    if (!currentSessionId) createNewSession();
    
    const session = sessions.find(s => s.id === currentSessionId);
    
    // Add user message
    session.messages.push({ role: 'user', content });
    session.updatedAt = Date.now();
    updateSessionTitle(currentSessionId, content);
    appendMessage('user', content);
    
    // Reset input
    chatInput.value = '';
    chatInput.style.height = 'auto';
    sendBtn.disabled = true;
    
    // Bot response placeholder
    const botContentEl = appendMessage('bot', '<i class="fas fa-circle-notch fa-spin"></i> Thinking...');
    
    try {
        const messages = session.messages.map(m => ({ role: m.role, content: m.content }));
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You are InfoTip, an expert coding assistant created by Nikelesh, a developer based in Chennai. You provide precise, accurate, and helpful answers. Format code blocks beautifully.' },
                    ...messages
                ],
                stream: true
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 401) {
                localStorage.removeItem('infotip_openai_key');
                throw new Error("Invalid API Key. Please refresh and enter a valid key.");
            }
            throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let botResponse = '';
        botContentEl.innerHTML = ''; // clear loading

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                            botResponse += data.choices[0].delta.content;
                            botContentEl.innerHTML = DOMPurify.sanitize(marked.parse(botResponse));
                            scrollToBottom();
                        }
                    } catch (e) {
                        console.error('Error parsing chunk:', e);
                    }
                }
            }
        }
        
        session.messages.push({ role: 'assistant', content: botResponse });
        session.updatedAt = Date.now();
        saveSessions();
        
        // Re-render the exact message HTML to ensure the copy button has the final encoded string
        const parentMsgDiv = botContentEl.closest('.message');
        const encodedContent = encodeURIComponent(botResponse);
        const copyBtn = parentMsgDiv.querySelector('.action-icon');
        copyBtn.setAttribute('onclick', `copyText('${encodedContent}')`);
        
    } catch (error) {
        console.error(error);
        botContentEl.innerHTML = DOMPurify.sanitize(marked.parse(`**Error:** ${error.message}`));
        showToast(error.message, 'error');
    } finally {
        sendBtn.disabled = false;
        chatInput.focus();
    }
}

// Actions
startChattingBtn.addEventListener('click', createNewSession);
newChatBtn.addEventListener('click', createNewSession);

exportBtn.addEventListener('click', () => {
    if (!currentSessionId) {
        showToast('No active chat to export', 'error');
        return;
    }
    const session = sessions.find(s => s.id === currentSessionId);
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(session, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `infotip-chat-${session.id}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    showToast('Chat exported securely');
});

redactBtn.addEventListener('click', () => {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const phoneRegex = /\+?[0-9]{1,3}[-.\s]?\(?[0-9]{1,3}\)?[-.\s]?[0-9]{3,4}[-.\s]?[0-9]{4}/g;
    const ipRegex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
    const secretRegex = /(bearer|api[_-]?key|secret|token|password)[\s:=]+["']?[a-zA-Z0-9\-_]{16,}["']?/gi;
    
    let content = chatInput.value;
    if (!content) {
        showToast('Nothing to redact in the input box', 'error');
        return;
    }
    
    const originalLen = content.length;
    content = content.replace(emailRegex, '[REDACTED_EMAIL]');
    content = content.replace(phoneRegex, '[REDACTED_PHONE]');
    content = content.replace(ipRegex, '[REDACTED_IP]');
    content = content.replace(secretRegex, '$1: [REDACTED_SECRET]');
    
    chatInput.value = content;
    if (content.length !== originalLen || content !== chatInput.value) { // just to be sure
        showToast('PII and Secrets Redacted from input');
    } else {
        showToast('No PII/Secrets found in input');
    }
});

// Send Events
sendBtn.addEventListener('click', handleSend);
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) handleSend();
    }
});

// Initialize
renderHistory();
