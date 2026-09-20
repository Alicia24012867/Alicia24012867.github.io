import React from 'react';
import ReactDOM from 'react-dom/client';
import ContentPage from '../content/ContentPage';
import NotesIndex from './NotesIndex';
import { noteIndex } from './catalog';
import { loadArticle } from 'virtual:notes';
import '../styles/global.css';
import '../styles/content.css';
import './notes.css';

const loadReader = () => import('./NoteReader');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ContentPage
      section="notes"
      bySlug={noteIndex.bySlug}
      titles={{
        listing: 'Notes / Knowledge Base · Alicia',
        missing: 'Note not found · Alicia',
        suffix: ' · Alicia',
      }}
      description="A personal wiki for formulas, source code, CUDA APIs, and SPICE algorithms."
      Listing={NotesIndex}
      loadBody={loadArticle}
      loadReader={loadReader}
    />
  </React.StrictMode>,
);
