import { useEffect } from 'react';
import articles from 'virtual:articles';
import Icon from '../Icons';
import ThemeToggle from '../components/ThemeToggle';
import { profile } from '../content';
import ArticleIndex from './ArticleIndex';
import ArticleReader from './ArticleReader';

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

  return <div className="blog-site">
    <a className="skip-link" href="#main">跳到主要内容</a>
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href="../#home" aria-label="Alicia 个人主页">
          <span className="brand-symbol"><Icon name="cloud"/></span>
          <span>Alicia<span className="brand-dot">.</span></span>
          <span className="brand-note">小小的个人宇宙</span>
        </a>
        <nav className="journal-nav" aria-label="手记导航">
          <a href="./" aria-current={!slug ? 'page' : undefined}><Icon name="book"/>手记</a>
        <a href="../notes/">知识库</a>
        </nav>
        <div className="header-actions">
          <a className="page-switch journal-home-switch" href="../#home" aria-label="返回个人主页" title="返回个人主页">
            <Icon name="arrow" className="back-arrow"/><span>个人主页</span>
          </a>
          <ThemeToggle/>
        </div>
      </div>
    </header>
    <main id="main">
      {slug ? article ? <ArticleReader article={article}/> : <MissingArticle/> : <ArticleIndex/>}
    </main>
    <footer className="site-footer page-width">
      <div><a className="footer-brand" href="../#home"><Icon name="cloud"/>Alicia.</a><span>© {new Date().getFullYear()} {profile.fullName}</span></div>
      <p>代码有逻辑，生活有诗意。<span>✧</span></p>
      <a href="../#home">回到个人主页<Icon name="arrow"/></a>
    </footer>
  </div>;
}
