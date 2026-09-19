import React from 'react';
import ReactDOM from 'react-dom/client';
import Notes from './Notes';
import 'katex/dist/katex.min.css';
import '../styles.css';
import '../blog/blog.css';
import './notes.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Notes /></React.StrictMode>);
