import React from 'react';
import ReactDOM from 'react-dom/client';
import Blog from './Blog';
import '../styles/global.css';
import '../styles/content.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Blog />
  </React.StrictMode>,
);
