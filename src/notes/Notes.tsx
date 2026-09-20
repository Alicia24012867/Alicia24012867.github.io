import ContentLayout from '../components/layout/ContentLayout';
import ContentNotFound from '../components/ContentNotFound';
import { usePageMeta } from '../hooks/usePageMeta';
import { noteIndex } from './catalog';
import NotesIndex from './NotesIndex';
import { loadArticle } from 'virtual:notes';
import ArticlePage from '../components/ArticlePage';

async function loadReader(slug: string) {
  const [body, { default: Reader }] = await Promise.all([
    loadArticle(slug),
    import('./NoteReader'),
  ]);
  return { body, Reader };
}

export default function Notes() {
  const slug = new URLSearchParams(window.location.search).get('post');
  const note = slug ? noteIndex.bySlug.get(slug) : undefined;
  usePageMeta(
    `${note ? note.title : slug ? 'Note not found' : 'Notes / Knowledge Base'} · Alicia`,
    note?.description ||
      'A personal wiki for formulas, source code, CUDA APIs, and SPICE algorithms.',
  );

  let content = <NotesIndex />;
  if (slug)
    content = note ? (
      <ArticlePage key={note.slug} summary={note} load={loadReader} />
    ) : (
      <ContentNotFound kind="note" />
    );
  return <ContentLayout section="notes">{content}</ContentLayout>;
}
