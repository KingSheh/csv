// frontend/upload.js
// Instead of importing API_URL, we'll use a global variable defined in config.js

// DOM elements
const fileUpload = document.getElementById('file-upload');
const uploadFeedback = document.getElementById('upload-feedback');
const apiKeyForm = document.getElementById('api-key-form');
const apiKeyInput = document.getElementById('api-key-input');

// Set up event listeners once DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log("Setting up upload.js event listeners");
    
    // Check if elements exist before adding event listeners
    if (fileUpload) {
        console.log("Adding file upload event listener");
        fileUpload.addEventListener('change', handleFileUpload);
    } else {
        console.error("File upload element not found");
    }
    
    if (apiKeyForm) {
        console.log("Adding API key form event listener");
        apiKeyForm.addEventListener('submit', handleApiKeySubmit);
    } else {
        console.error("API key form not found");
    }
});

// Handle API key submission
async function handleApiKeySubmit(event) {
    event.preventDefault();
    console.log("API key form submitted");
    
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
        alert('Please enter your OpenAI API key');
        return;
    }
    
    try {
        // Store API key hint (not the full key for security)
        const apiKeyHint = apiKey.substring(0, 3) + '...' + apiKey.substring(apiKey.length - 4);
        localStorage.setItem('openai_api_key_hint', apiKeyHint);
        
        console.log(`Sending API key to ${API_URL}/set-api-key`);
        
        // Create form data
        const formData = new FormData();
        formData.append('api_key', apiKey);
        
        // Send API key to backend
        const response = await fetch(`${API_URL}/set-api-key`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`Server returned ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        alert('API key set successfully! You can now upload transaction data.');
        
        // Clear the input for security
        apiKeyInput.value = '';
        
        // Refresh API key display
        if (typeof checkApiKey === 'function') {
            checkApiKey();
        }
        
    } catch (error) {
        console.error('Error setting API key:', error);
        alert(`Error setting API key: ${error.message}`);
    }
}
function setDebugApiKey() {
    // This is a convenience function for development only
    // Should be removed or disabled in production
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        const debugKey = localStorage.getItem('debug_api_key');
        if (debugKey) {
            console.log("Using debug API key from localStorage");
            
            // Create form data
            const formData = new FormData();
            formData.append('api_key', debugKey);
            
            // Send silently to backend
            fetch(`${API_URL}/set-api-key`, {
                method: 'POST',
                body: formData
            }).then(response => {
                if (response.ok) {
                    console.log("Debug API key set successfully");
                }
            }).catch(error => {
                console.error("Error setting debug API key:", error);
            });
        }
    }
}

// Call it when the page loads
document.addEventListener('DOMContentLoaded', function() {
    setDebugApiKey();
});
// Handle file upload
async function handleFileUpload(event) {
    console.log("File upload initiated");
    const file = event.target.files[0];
    if (!file) return;
    
    console.log(`File selected: ${file.name}`);
    
    // Check if OpenAI API key is set
    const apiKeyHint = localStorage.getItem('openai_api_key_hint');
    if (!apiKeyHint) {
        uploadFeedback.innerHTML = '<span style="color: red;"><i class="fas fa-exclamation-circle"></i> Please set your OpenAI API key first</span>';
        return;
    }
    
    // Check if file is a CSV
    if (!file.name.endsWith('.csv')) {
        uploadFeedback.innerHTML = '<span style="color: red;"><i class="fas fa-exclamation-circle"></i> Please upload a CSV file</span>';
        return;
    }
    
    // Show loading message
    uploadFeedback.innerHTML = '<span style="color: #10a37f;"><i class="fas fa-spinner fa-spin"></i> Uploading and processing your data...</span>';
    
    try {
        // Create form data
        const formData = new FormData();
        formData.append('file', file);
        
        console.log(`Uploading to ${API_URL}/upload`);
        
        // Upload file to API
        const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Server error: ${errorText}`);
            throw new Error(`Server returned ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log("Upload successful:", data);
        
        // Show success message
        uploadFeedback.innerHTML = `<span style="color: #10a37f;"><i class="fas fa-check-circle"></i> Successfully uploaded! ${data.transaction_count} transactions processed</span>`;
        
        // Add session to sidebar
        addSessionToSidebar(data.session_id);
        
        // Load the new session (this will also create and display the transaction table)
        loadSession(data.session_id);
        
        // Reset file input
        fileUpload.value = '';
        
        // Add a slight delay then toggle the transaction table to show it
        setTimeout(() => {
            const toggleButton = document.getElementById('toggle-table-btn');
            if (toggleButton) {
                toggleButton.click();
            }
        }, 500);
        
    } catch (error) {
        console.error('Error uploading file:', error);
        uploadFeedback.innerHTML = `<span style="color: red;"><i class="fas fa-exclamation-circle"></i> Error: ${error.message}</span>`;
    }
}