import { useMemo, useRef } from 'react';
import articles from 'virtual:articles';
import Icon from '../Icons';
import type { Article } from './types';
import { articleSectionById } from '../../scripts/sections.mjs';
import { ArticleMeta, ArticleTags } from './ArticleMeta';
import { articleUrl } from './urls';
import { useArticleReader } from './useArticleReader';

export default function ArticleReader({ article }: { article: Article }) {
  const bodyRef = useRef<HTMLElement>(null);
  // Preserve enhanced DOM nodes when TOC state changes (Mermaid, copy feedback, lazy images).
  const markup = useMemo(() => ({ __html: article.html }), [article.html]);
  const activeHeading = useArticleReader(bodyRef, article);
  const section = articleSectionById(article.section);
  const inSection = articles.filter(item => item.section === article.section);
  const index = inSection.findIndex(item => item.slug === article.slug);
  const newer = index > 0 ? inSection[index - 1] : undefined;
  const older = index >= 0 && index < inSection.length - 1 ? inSection[index + 1] : undefined;

  return <div className="journal-width reading-page">
    <a className="journal-back" href="./"><Icon name="arrow"/>全部手记</a>
    <header className="reading-header">
      <p className="eyebrow">{section.english} / {section.label}</p>
      <h1>{article.title}</h1>
      <p className="reading-description">{article.description}</p>
      <ArticleMeta article={article}/>
      <ArticleTags article={article}/>
    </header>
    <div className="reading-layout">
      <article ref={bodyRef} className="article-body" aria-label="文章正文" dangerouslySetInnerHTML={markup} />
      {article.headings.length > 0 && <aside className="article-toc"><nav aria-label="本文目录"><p>本文目录<span>CONTENTS</span></p><ol>{article.headings.map(heading => <li className={heading.level === 3 ? 'toc-subheading' : ''} key={heading.id}><a href={`#${encodeURIComponent(heading.id)}`} className={activeHeading === heading.id ? 'is-active' : undefined} aria-current={activeHeading === heading.id ? 'location' : undefined}>{heading.text}</a></li>)}</ol></nav><div className="toc-note"><Icon name="cloud"/><span>读一点，想一点。<br/>让好奇心继续生长。</span></div></aside>}
    </div>
    {(older || newer) && <nav className="article-pager" aria-label={`${section.label}中的相邻手记`}>
      {older ? <a href={articleUrl(older.slug)}><span>更早一篇</span><strong>{older.title}</strong></a> : <span />}
      {newer ? <a className="pager-newer" href={articleUrl(newer.slug)}><span>更新一篇</span><strong>{newer.title}</strong></a> : <span />}
    </nav>}
    <div className="reading-end"><span>✧</span><p>谢谢你读到这里。</p><a className="button button-ghost" href="./"><Icon name="book"/>回到手记</a><a className="reading-home" href="../#home">去个人主页看看<Icon name="arrow"/></a></div>
  </div>;
}
