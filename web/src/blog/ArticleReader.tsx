import { blogIndex } from './catalog';
import ArticleBody from '../content/reader/ArticleBody';
import type { LinkPreviewSource } from '../content/reader/LinkPreview';
import ListenButton from '../content/reader/ListenButton';
import ShareButton from '../content/reader/ShareButton';
import TextButton from '../content/reader/TextButton';
import ArticleComments from '../content/reader/ArticleComments';
import ArticleHeader from '../content/ArticleHeader';
import Icon from '../components/Icon';
import type { Article } from '../content/types';
import { blogSections } from '../config/sections.mjs';
import { articleUrl, listingUrl, queryFromSearch } from '../content/urls';
import { textLanguage } from '../content/language.mjs';
import { sortFromSearch } from '../content/sort';

const previews: LinkPreviewSource = {
  collection: 'blog',
  find: (slug) => blogIndex.bySlug.get(slug),
  section: (summary) => {
    const section = blogSections.byId(summary.section);
    return section.english || section.label;
  },
};

export default function ArticleReader({ article }: { article: Article }) {
  const query = queryFromSearch(window.location.search);
  const sort = sortFromSearch(window.location.search);
  const backUrl = listingUrl('blog', query, sort);
  const section = blogSections.byId(article.section);
  const inSection = blogIndex.groups.get(article.section) ?? [];
  const index = inSection.findIndex((item) => item.slug === article.slug);
  const newer = index > 0 ? inSection[index - 1] : undefined;
  const older = index >= 0 && index < inSection.length - 1 ? inSection[index + 1] : undefined;
  const eyebrow = `BLOG / ${(section.english || section.label).toUpperCase()}`;

  return (
    <div className="journal-width reading-page">
      <a className="journal-back" href={backUrl}>
        <Icon name="arrow" />
        {query ? 'Back to results' : 'All posts'}
      </a>
      <ArticleHeader
        article={article}
        eyebrow={eyebrow}
        collection="blog"
        showDetails
        actions={
          <>
            <ListenButton />
            <ShareButton article={article} />
            <TextButton />
          </>
        }
      />
      <ArticleBody article={article} eyebrow={eyebrow} previews={previews} />
      {(older || newer) && (
        <nav className="article-pager" aria-label={`More posts in ${section.label}`}>
          {older ? (
            <a href={articleUrl('blog', older.slug, query, sort)}>
              <span>Previous post</span>
              <strong className="article-title" lang={textLanguage(older.title)}>
                {older.title}
              </strong>
            </a>
          ) : (
            <span />
          )}
          {newer ? (
            <a className="pager-newer" href={articleUrl('blog', newer.slug, query, sort)}>
              <span>Next post</span>
              <strong className="article-title" lang={textLanguage(newer.title)}>
                {newer.title}
              </strong>
            </a>
          ) : (
            <span />
          )}
        </nav>
      )}
      {/* Comments are public on GitHub, so a locked post has none. */}
      {!article.locked && <ArticleComments collection="blog" slug={article.slug} />}
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
