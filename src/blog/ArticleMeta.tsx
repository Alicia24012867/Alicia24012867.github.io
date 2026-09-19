import { profile } from '../content';
import type { Article } from './types';
import { articleSectionById } from '../../scripts/sections.mjs';

const displayDate = (date: string) => date ? new Date(`${date}T00:00:00Z`).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : '未标注日期';
const searchUrl = (tag: string) => `./?q=${encodeURIComponent(tag)}`;

export function ArticleMeta({ article }: { article: Article }) {
  const section = articleSectionById(article.section);
  return <div className="article-meta"><a className="article-section-mark" href={`./#section-${section.id}`}>{section.label}</a><span className="meta-dot">·</span><span>{profile.name}</span><span className="meta-dot">·</span>{article.date && <><time dateTime={article.date}>{displayDate(article.date)}</time><span className="meta-dot">·</span></>}<span>约 {article.readingMinutes} 分钟阅读</span></div>;
}

export function ArticleTags({ article, onTag, showFormat = false }: { article: Article; onTag?: (tag: string) => void; showFormat?: boolean }) {
  return <div className="article-tags">
    {article.tags.map(tag => onTag
      ? <button type="button" key={tag} onClick={() => onTag(tag)}>{tag}</button>
      : <a key={tag} href={searchUrl(tag)}>{tag}</a>)}
    {showFormat && <span className="article-format">{article.format}</span>}
  </div>;
}
