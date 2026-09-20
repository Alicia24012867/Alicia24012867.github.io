import type { ArticleSummary } from './types';

const searchUrl = (tag: string) => `./?q=${encodeURIComponent(tag)}`;

export default function ArticleTags({
  article,
  onTag,
  showFormat = false,
}: {
  article: ArticleSummary;
  onTag?: (tag: string) => void;
  showFormat?: boolean;
}) {
  return (
    <div className="article-tags">
      {article.tags.map((tag) =>
        onTag ? (
          <button type="button" key={tag} onClick={() => onTag(tag)}>
            {tag}
          </button>
        ) : (
          <a key={tag} href={searchUrl(tag)}>
            {tag}
          </a>
        ),
      )}
      {showFormat && <span className="article-format">{article.format}</span>}
    </div>
  );
}
