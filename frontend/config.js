// frontend/config.js
// Define API_URL as a global variable
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8000' 
  : 'https://your-backend-url.onrender.com'; // Replace with your actual backend URL after deployment

// Log the API URL for debugging
console.log("API URL configured as:", API_URL);

// Add a function to test the API connection
async function testApiConnection() {
    try {
        const response = await fetch(`${API_URL}/health`);
        const data = await response.json();
        console.log("API health check:", data);
        return true;
    } catch (error) {
        console.error("API connection test failed:", error);
        return false;
    }
}

// Test connection when this script loads
testApiConnection();