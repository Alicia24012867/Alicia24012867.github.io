import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AdminApp from './AdminApp';
import '../styles/global.css';
import './admin.css';

// A page of its own: links from the site never swap it in, and it isn't kept for offline.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
