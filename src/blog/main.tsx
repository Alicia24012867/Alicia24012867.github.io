import ContentPage from '../content/ContentPage';
import ArticleIndex from './ArticleIndex';
import { blogIndex } from './catalog';
import { loadArticle } from 'virtual:articles';
import { keepForOffline } from '../offline';
import { showPage } from '../pages';
import '../styles/global.css';
import '../styles/content.css';

const loadReader = () => import('./ArticleReader');

keepForOffline();

showPage(import.meta.url, () => (
  <ContentPage
    section="blog"
    bySlug={blogIndex.bySlug}
    titles={{
      listing: 'Blog · Alicia',
      missing: 'Post not found · Alicia Blog',
      suffix: ' · Alicia Blog',
    }}
    description="Alicia’s blog. Code, learning, and little discoveries worth sharing."
    Listing={ArticleIndex}
    loadBody={loadArticle}
    loadReader={loadReader}
  />
));
