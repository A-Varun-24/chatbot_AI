
const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');

// Optional Gemini API key UI elements (may not exist if removed from HTML)
const tokenInput = document.getElementById('gemini-key');
const saveTokenBtn = document.getElementById('save-key');

// Initialize Gemini API key from localStorage if present
try {
    const saved = localStorage.getItem('gemini_api_key');
    if (saved) {
        window.GEMINI_API_KEY = saved;
        if (tokenInput) {
            tokenInput.value = '********'; // mask; do not reveal stored value
            tokenInput.setAttribute('data-masked', 'true');
            tokenInput.title = 'A Gemini API key is saved. Overwrite to change or clear.';
        }
        if (saveTokenBtn) saveTokenBtn.textContent = 'Key Saved';
    }
} catch (e) {
    console.warn('Token storage unavailable:', e);
}

// Save/Clear Gemini API key handlers
if (saveTokenBtn && tokenInput) {
    saveTokenBtn.addEventListener('click', () => {
        try {
            const raw = (tokenInput.value || '').trim();
            if (!raw) {
                // Clear key
                localStorage.removeItem('gemini_api_key');
                window.GEMINI_API_KEY = undefined;
                saveTokenBtn.textContent = 'Key Cleared';
                tokenInput.value = '';
                tokenInput.removeAttribute('data-masked');
                setTimeout(() => (saveTokenBtn.textContent = 'Save Key'), 1200);
                return;
            }
            // If the input is masked, do nothing (no change)
            if (tokenInput.getAttribute('data-masked') === 'true' && raw === '********') {
                saveTokenBtn.textContent = 'Key Saved';
                setTimeout(() => (saveTokenBtn.textContent = 'Save Key'), 1200);
                return;
            }
            localStorage.setItem('gemini_api_key', raw);
            window.GEMINI_API_KEY = raw;
            tokenInput.value = '********';
            tokenInput.setAttribute('data-masked', 'true');
            saveTokenBtn.textContent = 'Saved';
            setTimeout(() => (saveTokenBtn.textContent = 'Save Key'), 1200);
        } catch (e) {
            console.error('Failed to save key:', e);
            saveTokenBtn.textContent = 'Save Failed';
            setTimeout(() => (saveTokenBtn.textContent = 'Save Key'), 1500);
        }
    });
}

sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
    }
});

function sendMessage() {
    // Prevent double sends while a request is in-flight
    if (sendButton.disabled) return;

    const message = userInput.value.trim();
    if (!message) return;

    addMessage(message, 'user');
    userInput.value = '';
    userInput.disabled = true;
    sendButton.disabled = true;

    // Show typing indicator
    const typingIndicator = addTypingIndicator();

    // Timeout controller to avoid hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    // Use Google Gemini API (Generative Language API)
    const apiKey = window.GEMINI_API_KEY || localStorage.getItem('gemini_api_key');
    if (!apiKey) {
        // Remove typing indicator safely
        if (typingIndicator && typingIndicator.parentNode) {
            typingIndicator.parentNode.removeChild(typingIndicator);
        }
        addMessage('Gemini API key is required. Please enter it and click "Save Key".', 'ai');
        userInput.disabled = false;
        sendButton.disabled = false;
        userInput.focus();
        return;
    }

    const model = 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [
                {
                    role: 'user',
                    parts: [{ text: message }]
                }
            ]
        }),
        signal: controller.signal
    })
        .then(async (response) => {
            let data;
            try {
                data = await response.json();
            } catch (e) {
                throw new Error(`Invalid JSON from API (${response.status})`);
            }

            if (!response.ok) {
                // Data may contain an error message from the API
                const apiErr = data && data.error ? (data.error.message || JSON.stringify(data.error)) : null;
                const msg = apiErr ? `API error: ${apiErr}` : `HTTP ${response.status}`;
                throw new Error(msg);
            }
            return data;
        })
        .then((data) => {
            // Remove typing indicator safely
            if (typingIndicator && typingIndicator.parentNode) {
                typingIndicator.parentNode.removeChild(typingIndicator);
            }

            // Gemini response parsing: candidates[0].content.parts[*].text
            let reply = '';
            if (data && Array.isArray(data.candidates) && data.candidates.length > 0) {
                const cand = data.candidates[0];
                if (cand && cand.content && Array.isArray(cand.content.parts)) {
                    reply = cand.content.parts.map(p => p.text || '').join('').trim();
                }
            }
            if (!reply) {
                addMessage('Sorry, I couldn\'t generate a response. Please try again.', 'ai');
            } else {
                addMessage(reply, 'ai');
            }
        })
        .catch((error) => {
            // Remove typing indicator safely
            if (typingIndicator && typingIndicator.parentNode) {
                typingIndicator.parentNode.removeChild(typingIndicator);
            }
            console.error('Error:', error);
            const timedOut = error && (error.name === 'AbortError');
            const hint = (window.GEMINI_API_KEY || localStorage.getItem('gemini_api_key')) ? '' : ' Tip: Save your Gemini API key to proceed.';
            const msg = timedOut
                ? `The request timed out. Please try again.${hint}`
                : `An error occurred while contacting the Gemini service.${hint}`;
            addMessage(msg, 'ai');
        })
        .finally(() => {
            // Clear timeout
            try { clearTimeout(timeoutId); } catch (_) {}
            userInput.disabled = false;
            sendButton.disabled = false;
            userInput.focus();
        });
}

function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender === 'user' ? 'user-message' : 'ai-message');
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');
    contentDiv.textContent = text;
    messageDiv.appendChild(contentDiv);
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function addTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.classList.add('message', 'ai-message');
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content', 'typing');
    contentDiv.textContent = 'Typing...';
    typingDiv.appendChild(contentDiv);
    chatContainer.appendChild(typingDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return typingDiv;
}
