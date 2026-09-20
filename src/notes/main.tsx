import React from 'react';
import ReactDOM from 'react-dom/client';
import Notes from './Notes';
import '../styles/global.css';
import '../styles/content.css';
import './notes.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Notes />
  </React.StrictMode>,
);
