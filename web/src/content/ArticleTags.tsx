import { listingUrl, type Collection } from './urls';
import type { ArticleSummary } from './types';

export default function ArticleTags({
  article,
  onTag,
  showFormat = false,
  collection = 'blog',
}: {
  article: ArticleSummary;
  onTag?: (tag: string) => void;
  showFormat?: boolean;
  collection?: Collection;
}) {
  return (
    <div className="article-tags">
      {article.tags.map((tag) =>
        onTag ? (
          <button type="button" key={tag} onClick={() => onTag(tag)}>
            {tag}
          </button>
        ) : (
          <a key={tag} href={listingUrl(collection, tag)}>
            {tag}
          </a>
        ),
      )}
      {showFormat && <span className="article-format">{article.format}</span>}
    </div>
  );
}
