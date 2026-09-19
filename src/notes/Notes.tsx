import { useEffect, useMemo, useRef } from 'react';
import notes from 'virtual:notes';
import Icon from '../Icons';
import ThemeToggle from '../components/ThemeToggle';
import { ArticleTags } from '../blog/ArticleMeta';
import ArticleToc from '../blog/ArticleToc';
import { useArticleReader } from '../blog/useArticleReader';
import { useSearchQuery } from '../blog/useSearchQuery';
import { articleUrl } from '../blog/urls';
import type { Article } from '../blog/types';

const topics = [
  { id: 'formulas', label: '公式', description: '定义、推导与适用条件' },
  { id: 'source', label: '源码阅读', description: '调用路径、数据结构与疑问' },
  { id: 'cuda', label: 'CUDA API', description: '接口、用法与边界条件' },
  { id: 'spice', label: 'SPICE 算法', description: '电路方程、求解与收敛' },
  { id: 'other', label: '其他笔记', description: '还在生长的知识碎片' },
];
const topicOf = (note: Article) => topics.find(topic => topic.id === note.slug.split('/')[0]) || topics[4];
// Search rendered text rather than HTML markup or syntax-highlighting class names.
const textOf = (html: string) => new DOMParser().parseFromString(html, 'text/html').body.textContent || '';

function NoteReader({ note }: { note: Article }) {
  const bodyRef = useRef<HTMLElement>(null);
  const markup = useMemo(() => ({ __html: note.html }), [note.html]);
  const activeHeading = useArticleReader(bodyRef, note);
  const backlinks = useMemo(() => notes.filter(item => {
    const doc = new DOMParser().parseFromString(item.html, 'text/html');
    return item.slug !== note.slug && [...doc.querySelectorAll('a[href]')].some(link => {
      const url = new URL(link.getAttribute('href')!, window.location.href);
      return url.origin === window.location.origin && url.pathname === window.location.pathname && url.searchParams.get('post') === note.slug;
    });
  }), [note.slug]);
  return <div className="journal-width reading-page">
    <a className="journal-back" href="./"><Icon name="arrow"/>全部知识笔记</a>
    <header className="reading-header"><p className="eyebrow">KNOWLEDGE BASE / {topicOf(note).label}</p><h1>{note.title}</h1><p className="reading-description">{note.description}</p>{note.date && <p className="note-date">更新于 <time dateTime={note.date}>{note.date}</time></p>}<ArticleTags article={note}/></header>
    <div className="reading-layout"><article ref={bodyRef} className="article-body" aria-label="笔记正文" dangerouslySetInnerHTML={markup}/><ArticleToc headings={note.headings} activeHeading={activeHeading}/></div>
    <section className="note-backlinks" aria-labelledby="backlinks-title"><p className="eyebrow">LINKED REFERENCES</p><h2 id="backlinks-title">引用这篇笔记</h2>{backlinks.length ? <ul>{backlinks.map(item => <li key={item.slug}><a href={articleUrl(item.slug)}>{item.title}<Icon name="arrow"/></a></li>)}</ul> : <p>暂时没有其他笔记链接到这里。</p>}</section>
  </div>;
}

function NotesIndex() {
  const [query, setQuery] = useSearchQuery();
  const searchIndex = useMemo(() => notes.map(note => ({ note, text: `${note.title} ${note.description} ${note.tags.join(' ')} ${topicOf(note).label} ${textOf(note.html)}`.toLowerCase() })), []);
  const filtered = searchIndex.filter(item => item.text.includes(query.trim().toLowerCase())).map(item => item.note);
  return <>
    <section className="journal-hero"><div className="journal-width"><p className="eyebrow">NOTES / KNOWLEDGE BASE</p><h1>把知识，慢慢连起来<span>。</span></h1><p>公式、源码、接口与算法，随学随记，持续修订。<br/>Blog 写完整的故事，这里收集可以随时查阅的知识。</p><div className="journal-hero-note"><span>✧</span> 一座持续生长的个人 Wiki。</div></div></section>
    <div className="journal-width journal-list-section"><div className="journal-list-heading"><div><p className="eyebrow">BROWSE THE WIKI</p><h2>知识索引<span className="article-count">{notes.length}</span></h2></div><label className="article-search"><span className="visually-hidden">搜索笔记标题、正文或标签</span><Icon name="code"/><input type="search" placeholder="搜索公式、API、关键词…" value={query} onChange={event => setQuery(event.target.value)}/></label></div>
      <nav className="note-topics" aria-label="知识库主题">{topics.filter(topic => topic.id !== 'other' || notes.some(note => topicOf(note).id === 'other')).map(topic => <a key={topic.id} href={`./#topic-${topic.id}`}><strong>{topic.label}</strong><span>{topic.description}</span><small>{notes.filter(note => topicOf(note).id === topic.id).length} 篇笔记 ↗</small></a>)}</nav>
      <div aria-live="polite"><p className="note-results">{query ? `找到 ${filtered.length} 篇相关笔记` : '按主题整理 · 持续更新'}</p>{filtered.length === 0 && query && <div className="journal-empty"><h3>没有找到相关笔记</h3><p>试试其他关键词，或清除搜索。</p><button className="button button-primary" onClick={() => setQuery('')}>查看全部笔记</button></div>}
      {topics.map(topic => {
        const entries = filtered.filter(note => topicOf(note).id === topic.id).sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
        if ((query || topic.id === 'other') && !entries.length) return null;
        return <section className="journal-shelf" id={`topic-${topic.id}`} key={topic.id}><div className="journal-shelf-heading"><h3>{topic.label}<span className="article-count">{entries.length}</span></h3><p>{topic.description}</p></div>{entries.length ? entries.map(note => <article className="note-entry" key={note.slug}><div><h3><a href={articleUrl(note.slug)}>{note.title}</a></h3><p>{note.description}</p><ArticleTags article={note} onTag={setQuery}/></div><a className="journal-read" href={articleUrl(note.slug)} aria-label={`阅读：${note.title}`}><Icon name="arrow"/></a></article>) : <div className="journal-shelf-empty"><p>还没有笔记，留给下一次发现。</p></div>}</section>;
      })}</div>
    </div>
  </>;
}

export default function Notes() {
  const slug = new URLSearchParams(window.location.search).get('post');
  const note = notes.find(item => item.slug === slug);
  useEffect(() => {
    document.title = `${note ? note.title : slug ? '笔记未找到' : 'Notes / Knowledge Base'} · Alicia`;
    const description = note?.description || '公式、源码阅读、CUDA API 与 SPICE 算法的个人 Wiki。';
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', document.title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
  }, [note, slug]);
  return <div className="blog-site notes-site"><a className="skip-link" href="#main">跳到主要内容</a><header className="site-header"><div className="header-inner"><a className="brand" href="../" aria-label="Alicia 个人主页"><span className="brand-symbol"><Icon name="cloud"/></span><span>Alicia<span className="brand-dot">.</span></span></a><nav className="journal-nav" aria-label="内容导航"><a href="../blog/">Blog</a><a href="./" aria-current="page">知识库</a></nav><div className="header-actions"><a className="page-switch journal-home-switch" href="../"><span>个人主页</span></a><ThemeToggle/></div></div></header><main id="main">{slug ? note ? <NoteReader note={note}/> : <div className="journal-width journal-empty missing-article"><h1>这篇笔记还不在这里。</h1><p>它可能已被移动，或尚未发布。</p><a className="button button-primary" href="./">返回知识库</a></div> : <NotesIndex/>}</main><footer className="site-footer page-width"><a className="footer-brand" href="../">Alicia.</a><p>知识不必一次写完。<span>✧</span></p><a href="../blog/">去 Blog 阅读完整文章<Icon name="arrow"/></a></footer></div>;
}
