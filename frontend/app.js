// Global variables
let currentSessionId = null;
let exampleQueries = [];

// DOM elements
const initialView = document.getElementById('initial-view');
const chatView = document.getElementById('chat-view');
const messages = document.getElementById('messages');
const queryForm = document.getElementById('query-form');
const queryInput = document.getElementById('query-input');
const submitBtn = document.getElementById('submit-btn');
const sessionList = document.getElementById('session-list');
const exampleQueriesDiv = document.getElementById('example-queries');
const newChatBtn = document.getElementById('new-chat-btn');

// Initialize the application
async function init() {
    console.log("Initializing application...");
    
    // Test API connection first
    try {
        const connectionTest = await fetch(`${API_URL}/health`);
        if (!connectionTest.ok) {
            console.error("API connection test failed");
            alert("Cannot connect to the API server. Please ensure the backend is running.");
        } else {
            console.log("API connection successful");
        }
    } catch (error) {
        console.error("API connection error:", error);
        alert("Cannot connect to the API server. Please ensure the backend is running.");
    }
    
    // Load example queries
    await fetchExampleQueries();
    
    // Check for active sessions
    await loadSessions();
    
    // Set up event listeners
    setupEventListeners();

    checkApiKey();
    
    // Auto-resize textarea
    setupTextareaAutoResize();
}

// Fetch example queries from the API
async function fetchExampleQueries() {
    try {
        const response = await fetch(`${API_URL}/query-suggestions`);
        exampleQueries = await response.json();
        
        // Populate example queries in the UI
        exampleQueriesDiv.innerHTML = ''; // Clear existing items
        
        exampleQueries.forEach(query => {
            const div = document.createElement('div');
            div.className = 'example-item';
            div.textContent = query;
            div.addEventListener('click', () => {
                if (currentSessionId) {
                    queryInput.value = query;
                    queryForm.dispatchEvent(new Event('submit'));
                } else {
                    // If no session, store it as a suggested query
                    localStorage.setItem('suggested_query', query);
                }
            });
            exampleQueriesDiv.appendChild(div);
        });
    } catch (error) {
        console.error('Error fetching example queries:', error);
    }
}

// Load existing sessions from the API
async function loadSessions() {
    try {
        const response = await fetch(`${API_URL}/sessions`);
        const sessions = await response.json();
        
        // Clear existing session list
        sessionList.innerHTML = '';
        
        // Add each session to the sidebar
        sessions.forEach(sessionId => {
            addSessionToSidebar(sessionId);
        });
    } catch (error) {
        console.error('Error loading sessions:', error);
    }
}

// Add a session to the sidebar
function addSessionToSidebar(sessionId) {
    const div = document.createElement('div');
    div.className = 'session-item';
    div.dataset.sessionId = sessionId;
    
    div.innerHTML = `
        <i class="fas fa-file-alt"></i>
        <span>Transaction Analysis ${sessionId.substring(0, 6)}</span>
        <span class="delete-session"><i class="fas fa-trash"></i></span>
    `;
    
    div.addEventListener('click', (e) => {
        if (e.target.closest('.delete-session')) {
            deleteSession(sessionId);
            e.stopPropagation();
        } else {
            loadSession(sessionId);
        }
    });
    
    sessionList.appendChild(div);
}

// Clean up any existing transaction table
function cleanupTransactionTable() {
    const existingContainer = document.getElementById('transaction-container');
    if (existingContainer) {
        existingContainer.remove();
    }
    
    // Reset the table visibility state
    if (typeof resetTableState === 'function') {
        resetTableState();
    }
}
function checkApiKey() {
    const apiKeyHint = localStorage.getItem('openai_api_key_hint');
    if (apiKeyHint) {
        // Show a message that the API key is set
        const apiKeyInfo = document.querySelector('.api-key-info');
        if (apiKeyInfo) {
            apiKeyInfo.innerHTML = `
                <span style="color: #10a37f;"><i class="fas fa-check-circle"></i> API key is set (${apiKeyHint})</span>
                <br><a href="#" id="clear-api-key">Clear API key</a>
            `;
            
            // Add event listener to clear API key
            document.getElementById('clear-api-key').addEventListener('click', (e) => {
                e.preventDefault();
                localStorage.removeItem('openai_api_key_hint');
                apiKeyInfo.innerHTML = 'Your API key is used only for analysis and not stored permanently.';
                alert('API key cleared!');
            });
        }
    }
}

// Fetch conversation history for a session
async function fetchConversationHistory(sessionId) {
    try {

        const response = await fetch(`${API_URL}/messages/${sessionId}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch messages: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching conversation history:', error);
        return [];
    }
}

// Load a specific session
async function loadSession(sessionId) {
    currentSessionId = sessionId;
    
    // Update UI to show active session
    document.querySelectorAll('.session-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.sessionId === sessionId) {
            item.classList.add('active');
        }
    });
    
    // Show chat view and hide initial view
    initialView.style.display = 'none';
    chatView.style.display = 'flex';
    
    // Clear messages
    messages.innerHTML = '';
    
    // Update session info in UI
    const sessionInfo = document.getElementById('session-info');
    sessionInfo.innerHTML = `
        <span class="session-title">Transaction Analysis ${sessionId.substring(0, 6)}</span>
        <span class="conversation-info">Loading conversation history...</span>
    `;
    
    // Clean up any existing transaction table
    cleanupTransactionTable();
    
    // Create transaction table container
    const transactionContainer = document.createElement('div');
    transactionContainer.id = 'transaction-container';
    transactionContainer.className = 'transaction-container';
    
    // Create toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'toggle-table-btn';
    toggleBtn.className = 'toggle-table-btn';
    toggleBtn.innerHTML = '<i class="fas fa-chevron-down"></i> Show Transactions';
    toggleBtn.onclick = toggleTransactionTable;
    
    // Create table container
    const tableContainer = document.createElement('div');
    tableContainer.id = 'transaction-table-container';
    tableContainer.className = 'transaction-table-container';
    tableContainer.style.display = 'none'; // Initially hidden
    
    transactionContainer.appendChild(toggleBtn);
    transactionContainer.appendChild(tableContainer);
    
    // Insert after the session-info element
    sessionInfo.parentNode.insertBefore(transactionContainer, sessionInfo.nextSibling);
    
    try {
        // Fetch transactions for this session

        const response = await fetch(`${API_URL}/transactions/${sessionId}`);
        const transactions = await response.json();
        
        // Display transactions in the table
        displayTransactionsTable(transactions, 'transaction-table-container');
        
        // Fetch conversation history for this session
        const messageHistory = await fetchConversationHistory(sessionId);
        
        // Update the conversation info
        const conversationInfo = document.querySelector('.conversation-info');
        if (conversationInfo) {
            if (messageHistory && messageHistory.length > 0) {
                const messageCount = messageHistory.length;
                conversationInfo.textContent = `${messageCount} previous messages`;
            } else {
                conversationInfo.textContent = 'New conversation';
            }
        }
        
        // If there's conversation history, display it
        if (messageHistory && messageHistory.length > 0) {
            messageHistory.forEach(message => {
                addMessage(message.role, message.content);
            });
        } else {
            // Add welcome message if no conversation history
            addMessage('assistant', 'I\'ve loaded your transaction data. What would you like to know about your finances?');
        }
        
        // Check if there's a suggested query from before
        const suggestedQuery = localStorage.getItem('suggested_query');
        if (suggestedQuery) {
            queryInput.value = suggestedQuery;
            localStorage.removeItem('suggested_query');
        }
        
        // Focus on input
        queryInput.focus();
        
    } catch (error) {
        console.error('Error loading session data:', error);
        addMessage('assistant', 'Error loading transaction data. Please try again or contact support.');
    }
}

// Delete a session
async function deleteSession(sessionId) {
    if (confirm('Are you sure you want to delete this session?')) {

        try {
            await fetch(`${API_URL}/sessions/${sessionId}`, {
                method: 'DELETE'
            });
            
            // Remove from UI
            const sessionElement = document.querySelector(`.session-item[data-session-id="${sessionId}"]`);
            if (sessionElement) {
                sessionElement.remove();
            }
            
            // If current session was deleted, go back to initial view
            if (currentSessionId === sessionId) {
                currentSessionId = null;
                initialView.style.display = 'flex';
                chatView.style.display = 'none';
                
                // Clean up transaction table
                cleanupTransactionTable();
            }
        } catch (error) {
            console.error('Error deleting session:', error);
            alert('Failed to delete session. Please try again.');
        }
    }
}

// Add a message to the chat
function addMessage(sender, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    
    // Determine avatar content
    let avatarContent = sender === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';
    
    // Fix for marked.parse handling null or undefined content
    const formattedContent = content ? (sender === 'assistant' ? marked.parse(content) : content) : 'No response received';
    
    messageDiv.innerHTML = `
        <div class="avatar">${avatarContent}</div>
        <div class="message-content">${formattedContent}</div>
    `;
    
    messages.appendChild(messageDiv);
    
    // Scroll to bottom
    messages.scrollTop = messages.scrollHeight;
    
    // Apply syntax highlighting to code blocks
    document.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
    });
}

// Add a loading message
function addLoadingMessage() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';
    messageDiv.id = 'loading-message';
    
    messageDiv.innerHTML = `
        <div class="avatar"><i class="fas fa-robot"></i></div>
        <div class="message-content message-loading">
            <div class="loading-dot"></div>
            <div class="loading-dot"></div>
            <div class="loading-dot"></div>
        </div>
    `;
    
    messages.appendChild(messageDiv);
    messages.scrollTop = messages.scrollHeight;
    
    return messageDiv;
}

// Submit a query to the API
async function submitQuery(query) {
    if (!currentSessionId || !query.trim()) return;
    
    // Add user message
    addMessage('user', query);
    
    // Add loading message
    const loadingMessage = addLoadingMessage();
    
    try {
        const response = await fetch(`${API_URL}/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: currentSessionId,
                query: query
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `Server returned ${response.status}`);
        }
        
        const data = await response.json();
        
        // Remove loading message
        loadingMessage.remove();
        
        // Add assistant response
        addMessage('assistant', data.response);
    } catch (error) {
        console.error('Error analyzing query:', error);
        
        // Remove loading message
        loadingMessage.remove();
        
        // Add error message
        addMessage('assistant', `Error: ${error.message || 'Unknown error occurred'}. Please make sure your OpenAI API key is set correctly.`);
    }
}

// Set up event listeners
function setupEventListeners() {
    // Handle form submission
    queryForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = queryInput.value.trim();
        if (query) {
            submitQuery(query);
            queryInput.value = '';
            // Reset textarea height
            queryInput.style.height = 'auto';
        }
    });
    
    // New chat button
    newChatBtn.addEventListener('click', () => {
        currentSessionId = null;
        initialView.style.display = 'flex';
        chatView.style.display = 'none';
        
        // Clean up transaction table
        cleanupTransactionTable();
    });
    
    // Enable Enter key on textarea (Shift+Enter for new line)
    queryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (queryInput.value.trim()) {
                queryForm.dispatchEvent(new Event('submit'));
            }
        }
    });
}

// Set up auto-resize for textarea
function setupTextareaAutoResize() {
    queryInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', init);