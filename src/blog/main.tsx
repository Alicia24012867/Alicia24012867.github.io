import React from 'react';
import ReactDOM from 'react-dom/client';
import Blog from './Blog';
import 'katex/dist/katex.min.css';
import '../styles.css';
import './blog.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Blog /></React.StrictMode>);
