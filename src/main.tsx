import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Support external backend URL for static site deployments (e.g. Render, Vercel, Netlify)
const VITE_API_URL = (import.meta as any).env.VITE_API_URL || '';
if (VITE_API_URL) {
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    let targetInput = input;
    if (typeof input === 'string' && input.startsWith('/api/')) {
      const cleanBase = VITE_API_URL.endsWith('/') ? VITE_API_URL.slice(0, -1) : VITE_API_URL;
      targetInput = cleanBase + input;
    } else if (input instanceof Request && input.url.startsWith('/api/')) {
      const cleanBase = VITE_API_URL.endsWith('/') ? VITE_API_URL.slice(0, -1) : VITE_API_URL;
      const newUrl = cleanBase + input.url;
      targetInput = new Request(newUrl, input);
    }
    return originalFetch(targetInput, init);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
