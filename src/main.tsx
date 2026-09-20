import React from 'react';
import ReactDOM from 'react-dom/client';
import Home from './home/Home';
import './styles/global.css';
import './home/home.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Home />
  </React.StrictMode>,
);
