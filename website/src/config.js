/**
 * Application configuration
 * Loads environment variables for the frontend
 */

export const config = {
  // Backend API URL (loaded from .env)
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  
  // API endpoints
  api: {
    generate: '/api/generate',
    history: '/api/history',
  },
};

export default config;
