import { blogIndex } from './catalog';
import ArticleBody from '../content/reader/ArticleBody';
import ArticleTags from '../content/ArticleTags';
import Icon from '../components/Icon';
import type { Article } from '../content/types';
import { articleSectionById } from '../config/sections.mjs';
import ArticleMeta from '../content/ArticleMeta';
import { articleUrl, listingUrl, queryFromSearch } from '../content/urls';

export default function ArticleReader({ article }: { article: Article }) {
  const query = queryFromSearch(window.location.search);
  const backUrl = listingUrl(query);
  const section = articleSectionById(article.section);
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
      <header className="reading-header">
        <p className="eyebrow">
          {section.english} / {section.label}
        </p>
        <h1 className="article-title">{article.title}</h1>
        <p className="reading-description">{article.description}</p>
        <ArticleMeta article={article} showDetails readingTime="estimate" />
        <ArticleTags article={article} />
      </header>
      <ArticleBody article={article} />
      {(older || newer) && (
        <nav className="article-pager" aria-label={`More posts in ${section.label}`}>
          {older ? (
            <a href={articleUrl(older.slug, query)}>
              <span>Previous post</span>
              <strong className="article-title">{older.title}</strong>
            </a>
          ) : (
            <span />
          )}
          {newer ? (
            <a className="pager-newer" href={articleUrl(newer.slug, query)}>
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
        <a className="reading-home" href="../#home">
          Visit my homepage
          <Icon name="arrow" />
        </a>
      </div>
    </div>
  );
}
