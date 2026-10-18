import ContentPage from '../content/ContentPage';
import NotesIndex from './NotesIndex';
import { noteIndex } from './catalog';
import { loadArticle } from 'virtual:notes';
import { keepForOffline } from '../offline';
import { showPage } from '../pages';
import '../styles/global.css';
import '../styles/content.css';

const loadReader = () => import('./NoteReader');

keepForOffline();

showPage(import.meta.url, () => (
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
));
