import ContentLayout from '../components/layout/ContentLayout';
import ContentNotFound from '../components/ContentNotFound';
import { usePageMeta } from '../hooks/usePageMeta';
import { blogIndex } from './catalog';
import ArticleIndex from './ArticleIndex';
import { loadArticle } from 'virtual:articles';
import ArticlePage from '../components/ArticlePage';

async function loadReader(slug: string) {
  const [body, { default: Reader }] = await Promise.all([
    loadArticle(slug),
    import('./ArticleReader'),
  ]);
  return { body, Reader };
}

export default function Blog() {
  const slug = new URLSearchParams(window.location.search).get('post');
  const article = slug ? blogIndex.bySlug.get(slug) : undefined;
  usePageMeta(
    article
      ? `${article.title} · Alicia Blog`
      : slug
        ? 'Post not found · Alicia Blog'
        : 'Blog · Alicia',
    article?.description || 'Alicia’s blog. Code, learning, and little discoveries worth sharing.',
  );

  let content = <ArticleIndex />;
  if (slug)
    content = article ? (
      <ArticlePage key={article.slug} summary={article} load={loadReader} />
    ) : (
      <ContentNotFound kind="post" />
    );
  return <ContentLayout section="blog">{content}</ContentLayout>;
}
