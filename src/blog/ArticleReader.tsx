import { blogIndex } from './catalog';
import ArticleBody from '../content/reader/ArticleBody';
import ArticleHeader from '../content/ArticleHeader';
import Icon from '../components/Icon';
import type { Article } from '../content/types';
import { blogSections } from '../config/sections.mjs';
import { articleUrl, listingUrl, queryFromSearch } from '../content/urls';
import { sortFromSearch } from '../content/sort';

export default function ArticleReader({ article }: { article: Article }) {
  const query = queryFromSearch(window.location.search);
  const sort = sortFromSearch(window.location.search);
  const backUrl = listingUrl('blog', query, sort);
  const section = blogSections.byId(article.section);
  const inSection = blogIndex.groups.get(article.section) ?? [];
  const index = inSection.findIndex((item) => item.slug === article.slug);
  const newer = index > 0 ? inSection[index - 1] : undefined;
  const older = index >= 0 && index < inSection.length - 1 ? inSection[index + 1] : undefined;

  return (
    <div className="journal-width reading-page">
      <a className="journal-back" href={backUrl}>
        <Icon name="arrow" />
        {query ? 'Back to results' : 'All posts'}
      </a>
      <ArticleHeader
        article={article}
        eyebrow={[section.english, section.label].filter(Boolean).join(' / ')}
        collection="blog"
        showDetails
      />
      <ArticleBody article={article} />
      {(older || newer) && (
        <nav className="article-pager" aria-label={`More posts in ${section.label}`}>
          {older ? (
            <a href={articleUrl('blog', older.slug, query, sort)}>
              <span>Previous post</span>
              <strong className="article-title">{older.title}</strong>
            </a>
          ) : (
            <span />
          )}
          {newer ? (
            <a className="pager-newer" href={articleUrl('blog', newer.slug, query, sort)}>
              <span>Next post</span>
              <strong className="article-title">{newer.title}</strong>
            </a>
          ) : (
            <span />
          )}
        </nav>
      )}
      <div className="reading-end">
        <span>✧</span>
        <p>Thanks for reading.</p>
        <a className="button button-ghost" href={backUrl}>
          <Icon name="book" />
          {query ? 'Back to results' : 'Back to blog'}
        </a>
        <a className="reading-home" href="/#home">
          Visit my homepage
          <Icon name="arrow" />
        </a>
      </div>
    </div>
  );
}
