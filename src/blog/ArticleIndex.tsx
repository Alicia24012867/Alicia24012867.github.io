import articles from 'virtual:articles';
import Icon from '../Icons';
import type { Article } from './types';
import { articleSectionById, articleSections } from '../../scripts/sections.mjs';
import { ArticleMeta, ArticleTags } from './ArticleMeta';
import { articleUrl } from './urls';
import { useSearchQuery } from './useSearchQuery';

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

export default function ArticleIndex() {
  const [query, setQuery] = useSearchQuery();
  const needle = query.trim().toLowerCase();
  const filtered = articles.filter(article => {
    const section = articleSectionById(article.section);
    return `${article.title} ${article.description} ${article.tags.join(' ')} ${section.label} ${section.english}`.toLowerCase().includes(needle);
  });

  const clearQuery = () => setQuery('');

  return <>
    <section className="journal-hero"><div className="journal-width"><p className="eyebrow"><span /> ALICIA'S FIELD NOTES</p><h1>字里行间，<br className="journal-mobile-break"/>都是探索<span>。</span></h1><p>记录代码里的灵光，学习中的顿悟，<br/>还有生活里那些值得留住的片刻。</p><div className="journal-hero-note"><span>✧</span> 慢慢写，慢慢成为自己。</div><div className="journal-doodle" aria-hidden="true"><Icon name="book"/><span>✦</span><i>thoughts, in the making</i></div></div></section>
    <div className="journal-width journal-list-section">
      <div className="journal-list-heading">
        <div><p className="eyebrow">THE NOTEBOOK</p><h2 id="journal-list-title">所有手记<span className="article-count">{String(articles.length).padStart(2, '0')}</span></h2></div>
        <label className="article-search"><span className="visually-hidden">搜索文章标题、摘要或标签</span><Icon name="book"/><input type="search" placeholder="寻找一段文字…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      </div>
      <nav className="journal-section-nav" aria-label="手记分区">
        {articleSections.filter(section => !needle || filtered.some(article => article.section === section.id)).map(section => <a key={section.id} href={`#section-${section.id}`}>{section.label}</a>)}
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
