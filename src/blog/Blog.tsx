import { useEffect, useRef, useState } from 'react';
import articles from 'virtual:articles';
import Icon from '../Icons';
import ThemeToggle from '../components/ThemeToggle';
import { profile } from '../content';
import type { Article } from './types';
import { articleSectionById, articleSections } from '../../scripts/sections.mjs';

const articleUrl = (slug: string) => `?post=${encodeURIComponent(slug)}`;
const displayDate = (date: string) => date ? new Date(`${date}T00:00:00Z`).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : '未标注日期';
const searchUrl = (tag: string) => `./?q=${encodeURIComponent(tag)}`;

function ArticleMeta({ article }: { article: Article }) {
  const section = articleSectionById(article.section);
  return <div className="article-meta"><a className="article-section-mark" href={`./#section-${section.id}`}>{section.label}</a><span className="meta-dot">·</span><span>{profile.name}</span><span className="meta-dot">·</span>{article.date && <><time dateTime={article.date}>{displayDate(article.date)}</time><span className="meta-dot">·</span></>}<span>约 {article.readingMinutes} 分钟阅读</span></div>;
}

function ArticleTags({ article, onTag, showFormat = false }: { article: Article; onTag?: (tag: string) => void; showFormat?: boolean }) {
  return <div className="article-tags">
    {article.tags.map(tag => onTag
      ? <button type="button" key={tag} onClick={() => onTag(tag)}>{tag}</button>
      : <a key={tag} href={searchUrl(tag)}>{tag}</a>)}
    {showFormat && <span className="article-format">{article.format}</span>}
  </div>;
}

function JournalEntry({ article, index, onTag }: { article: Article; index: number; onTag: (tag: string) => void }) {
  return <article className="journal-entry">
    <span className="journal-entry-number">{String(index + 1).padStart(2, '0')}<span>/</span></span>
    <div className="journal-entry-content">
      <ArticleMeta article={article}/>
      <h3><a href={articleUrl(article.slug)}>{article.title}</a></h3>
      <p>{article.description}</p>
      <ArticleTags article={article} onTag={onTag} showFormat/>
    </div>
    <a className="journal-read" href={articleUrl(article.slug)} aria-label={`阅读：${article.title}`}><Icon name="arrow"/></a>
  </article>;
}

function ArticleIndex() {
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '');
  const needle = query.trim().toLowerCase();
  const filtered = articles.filter(article => {
    const section = articleSectionById(article.section);
    return `${article.title} ${article.description} ${article.tags.join(' ')} ${section.label} ${section.english}`.toLowerCase().includes(needle);
  });

  function clearQuery() {
    setQuery('');
    const url = new URL(window.location.href);
    if (!url.searchParams.has('q')) return;
    url.searchParams.delete('q');
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  return <>
    <section className="journal-hero"><div className="journal-width"><p className="eyebrow"><span /> ALICIA'S FIELD NOTES</p><h1>字里行间，<br className="journal-mobile-break"/>都是探索<span>。</span></h1><p>记录代码里的灵光，学习中的顿悟，<br/>还有生活里那些值得留住的片刻。</p><div className="journal-hero-note"><span>✧</span> 慢慢写，慢慢成为自己。</div><div className="journal-doodle" aria-hidden="true"><Icon name="book"/><span>✦</span><i>thoughts, in the making</i></div></div></section>
    <div className="journal-width journal-list-section">
      <div className="journal-list-heading">
        <div><p className="eyebrow">THE NOTEBOOK</p><h2 id="journal-list-title">所有手记<span className="article-count">{String(articles.length).padStart(2, '0')}</span></h2></div>
        <label className="article-search"><span className="visually-hidden">搜索文章标题、摘要或标签</span><Icon name="book"/><input type="search" placeholder="寻找一段文字…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      </div>
      <nav className="journal-section-nav" aria-label="手记分区">
        {articleSections.map(section => <a key={section.id} href={`#section-${section.id}`}>{section.label}</a>)}
      </nav>
      <div className="article-results" aria-live="polite">
        {needle && !filtered.length
          ? <div className="journal-empty"><Icon name="cloud"/><h3>还没有找到这段文字</h3><p>换一个关键词，或看看全部分区。</p><button className="button button-primary" onClick={clearQuery}>查看全部手记</button></div>
          : articleSections.map(section => {
            const entries = filtered.filter(article => article.section === section.id);
            if (needle && !entries.length) return null;
            return <section className="journal-shelf" id={`section-${section.id}`} key={section.id} aria-labelledby={`shelf-${section.id}`}>
              <div className="journal-shelf-heading">
                <div>
                  <p className="eyebrow">{section.english}</p>
                  <h3 id={`shelf-${section.id}`}>{section.label}<span className="article-count">{String(entries.length).padStart(2, '0')}</span></h3>
                </div>
                <p>{section.description}</p>
              </div>
              {entries.length
                ? entries.map((article, index) => <JournalEntry article={article} index={index} key={article.slug} onTag={setQuery}/>)
                : <div className="journal-shelf-empty"><Icon name="cloud"/><p>{section.empty}</p></div>}
            </section>;
          })}
      </div>
      <div className="journal-list-bottom"><span>✧</span> 每一次记录，都让思考更清晰一点。</div>
    </div>
  </>;
}

function ArticleReader({ article }: { article: Article }) {
  const bodyRef = useRef<HTMLElement>(null);
  const [activeHeading, setActiveHeading] = useState(article.headings[0]?.id ?? '');
  const section = articleSectionById(article.section);
  const inSection = articles.filter(item => item.section === article.section);
  const index = inSection.findIndex(item => item.slug === article.slug);
  const newer = index > 0 ? inSection[index - 1] : undefined;
  const older = index >= 0 && index < inSection.length - 1 ? inSection[index + 1] : undefined;

  useEffect(() => {
    if (!window.location.hash) return;
    let anchor;
    try { anchor = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
    const frame = requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView());
    return () => cancelAnimationFrame(frame);
  }, [article.slug]);

  useEffect(() => {
    const nodes = article.headings.map(heading => document.getElementById(heading.id)).filter((node): node is HTMLElement => !!node);
    if (!nodes.length) return;
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]?.target.id) setActiveHeading(visible[0].target.id);
    }, { rootMargin: '-18% 0px -68% 0px', threshold: 0 });
    nodes.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [article.headings, article.slug]);

  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    const onClick = async (event: MouseEvent) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.copy-code');
      if (!button || !root.contains(button)) return;
      const original = button.textContent;
      try {
        await navigator.clipboard.writeText(button.closest('.article-mermaid')?.querySelector('.mermaid-source')?.textContent
          ?? button.closest('pre')?.querySelector('code')?.textContent
          ?? '');
        button.textContent = '已复制';
      } catch {
        button.textContent = '复制失败';
      }
      window.setTimeout(() => { button.textContent = original; }, 2000);
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [article.slug]);

  useEffect(() => {
    const root = bodyRef.current;
    if (!root?.querySelector('.article-mermaid')) return;
    let cancelled = false;
    let generation = 0;
    const draw = async () => {
      const current = ++generation;
      const { renderMermaidDiagrams } = await import('./renderMermaid');
      if (cancelled || current !== generation || !bodyRef.current) return;
      const theme = document.documentElement.dataset.theme === 'night' ? 'night' : 'day';
      await renderMermaidDiagrams(bodyRef.current, theme, () => cancelled || current !== generation);
    };
    const observer = new MutationObserver(() => { void draw(); });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    void draw();
    return () => { cancelled = true; observer.disconnect(); };
  }, [article.slug]);

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
      <article ref={bodyRef} className="article-body" aria-label="文章正文" dangerouslySetInnerHTML={{ __html: article.html }} />
      {article.headings.length > 0 && <aside className="article-toc"><nav aria-label="本文目录"><p>本文目录<span>CONTENTS</span></p><ol>{article.headings.map(heading => <li className={heading.level === 3 ? 'toc-subheading' : ''} key={heading.id}><a href={`#${encodeURIComponent(heading.id)}`} className={activeHeading === heading.id ? 'is-active' : undefined} aria-current={activeHeading === heading.id ? 'location' : undefined}>{heading.text}</a></li>)}</ol></nav><div className="toc-note"><Icon name="cloud"/><span>读一点，想一点。<br/>让好奇心继续生长。</span></div></aside>}
    </div>
    {(older || newer) && <nav className="article-pager" aria-label={`${section.label}中的相邻手记`}>
      {older ? <a href={articleUrl(older.slug)}><span>更早一篇</span><strong>{older.title}</strong></a> : <span />}
      {newer ? <a className="pager-newer" href={articleUrl(newer.slug)}><span>更新一篇</span><strong>{newer.title}</strong></a> : <span />}
    </nav>}
    <div className="reading-end"><span>✧</span><p>谢谢你读到这里。</p><a className="button button-ghost" href="./"><Icon name="book"/>回到手记</a><a className="reading-home" href="../#home">去个人主页看看<Icon name="arrow"/></a></div>
  </div>;
}

function MissingArticle() {
  return <div className="journal-width journal-empty missing-article"><Icon name="cloud"/><p className="eyebrow">PAGE NOT FOUND</p><h1>这页手记，还没有写下。</h1><p>文章可能已被移动，或暂时收进了草稿箱。</p><a className="button button-primary" href="./">返回全部手记<Icon name="arrow"/></a></div>;
}

export default function Blog() {
  const slug = new URLSearchParams(window.location.search).get('post');
  const article = articles.find(item => item.slug === slug);
  useEffect(() => {
    document.title = article ? `${article.title} · Alicia 手记` : slug ? '文章未找到 · Alicia 手记' : '手记 · Alicia';
    const description = article?.description || 'Alicia 的手记。关于代码、学习，以及那些值得记录的小小发现。';
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', document.title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
  }, [article, slug]);

  return <div className="blog-site"><a className="skip-link" href="#main">跳到主要内容</a><header className="site-header"><div className="header-inner"><a className="brand" href="../#home" aria-label="Alicia 个人主页"><span className="brand-symbol"><Icon name="cloud"/></span><span>Alicia<span className="brand-dot">.</span></span><span className="brand-note">小小的个人宇宙</span></a><nav className="journal-nav" aria-label="手记导航"><a href="./" aria-current={!slug ? 'page' : undefined}><Icon name="book"/>手记</a></nav><div className="header-actions"><a className="page-switch journal-home-switch" href="../#home"><Icon name="arrow" className="back-arrow"/><span>个人主页</span></a><ThemeToggle/></div></div></header><main id="main">{slug ? article ? <ArticleReader article={article}/> : <MissingArticle/> : <ArticleIndex/>}</main><footer className="site-footer page-width"><div><a className="footer-brand" href="../#home"><Icon name="cloud"/>Alicia.</a><span>© {new Date().getFullYear()} {profile.fullName}</span></div><p>代码有逻辑，生活有诗意。<span>✧</span></p><a href="../#home">回到个人主页<Icon name="arrow"/></a></footer></div>;
}
