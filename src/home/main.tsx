import React from 'react';
import ReactDOM from 'react-dom/client';
import Home from './Home';
import { keepForOffline } from '../offline';
import '../styles/global.css';
import './home.css';

keepForOffline();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Home />
  </React.StrictMode>,
);
