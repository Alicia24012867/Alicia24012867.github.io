import { useEffect, useRef, useState } from 'react';
import Icon from './Icons';
import { interests, profile, type Interest } from './content';

const navigation = [
  { id: 'home', label: '首页' },
  { id: 'about', label: '关于我' },
  { id: 'explore', label: '探索中' },
  { id: 'contact', label: '联系' },
];

function InterestArtwork({ kind }: { kind: string }) {
  if (kind === 'hpc') return <div className="compute-art" aria-hidden="true"><div className="chip-grid">{Array.from({ length: 25 }, (_, i) => <i key={i} />)}</div><span className="art-formula">parallel possibilities</span><span className="art-cross">+</span></div>;
  if (kind === 'science') return <div className="science-art" aria-hidden="true"><svg viewBox="0 0 320 150"><defs><linearGradient id="curve-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#65afec" stopOpacity=".4"/><stop offset="100%" stopColor="#65afec" stopOpacity="0"/></linearGradient></defs><path d="M10 125C70 125 89 125 119 67S164 5 194 65s49 60 116 60v15H10Z" fill="url(#curve-fill)"/><path d="M10 125C70 125 89 125 119 67S164 5 194 65s49 60 116 60" fill="none" stroke="#5399d9" strokeWidth="2"/><path d="M20 126h285M160 20v120" stroke="#81aad0" strokeOpacity=".4" strokeDasharray="3 5"/><circle cx="158" cy="26" r="5" fill="#549ce0"/><circle cx="158" cy="26" r="10" fill="none" stroke="#549ce0" strokeOpacity=".2"/></svg><span className="art-formula">a little closer to understanding</span></div>;
  return <div className="network-art" aria-hidden="true"><svg viewBox="0 0 320 155"><g fill="none" stroke="#89b2dc" strokeWidth="1" opacity=".55">{[43, 78, 113].flatMap((y, i) => [30, 63, 96, 129].map((y2, j) => <path key={`${i}-${j}`} d={`M91 ${y} 160 ${y2} 229 ${y}`} />))}{[30, 63, 96, 129].map((y, i) => <path key={i} d={`M160 ${y} 229 78`} />)}</g>{[43, 78, 113].map((y, i) => <circle key={`a-${i}`} cx="91" cy={y} r="7" fill="#f5fbff" stroke="#7caee0"/>)}{[30, 63, 96, 129].map((y, i) => <circle key={`b-${i}`} cx="160" cy={y} r="8" fill={i === 1 ? '#529bdf' : '#e0f0ff'} stroke="#72a9df"/>)}{[43, 78, 113].map((y, i) => <circle key={`c-${i}`} cx="229" cy={y} r="7" fill="#f5fbff" stroke="#7caee0"/>)}</svg><span className="art-formula">connect the dots</span></div>;
}

function InterestDialog({ interest, close }: { interest: Interest | null; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!interest || !dialog) return;
    dialog.showModal();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = oldOverflow; };
  }, [interest]);

  return <dialog ref={ref} className="interest-dialog" aria-labelledby="interest-title" onCancel={close} onClick={(event) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  }}>
    {interest && <>
      <button className="icon-button dialog-close" aria-label="关闭详情" onClick={close} autoFocus><Icon name="close" /></button>
      <span className="eyebrow">EXPLORING / {interest.number}</span>
      <h2 id="interest-title">{interest.title}</h2>
      <p className="dialog-subtitle">{interest.subtitle}</p>
      <p>{interest.detail}</p>
      <h3>好奇心的方向</h3>
      <ul>{interest.topics.map(topic => <li key={topic}>{topic}</li>)}</ul>
      <h3>一起探索</h3>
      <div className="resource-links">{interest.links.map(link => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.label}<Icon name="arrow" /></a>)}</div>
      <p className="dialog-note">这里记录的是我感兴趣的学习方向，欢迎交流。</p>
    </>}
  </dialog>;
}

export default function App() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme === 'night' ? 'night' : 'day');
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState('home');
  const [interest, setInterest] = useState<Interest | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'night' ? '#111e33' : '#f5faff');
    try { localStorage.setItem('alicia-sky-theme', theme); } catch { /* Theme still works without storage. */ }
  }, [theme]);

  useEffect(() => {
    const sections = navigation.map(({ id }) => document.getElementById(id)).filter((element): element is HTMLElement => !!element);
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) setActive(entry.target.id); });
    }, { rootMargin: '-18% 0px -55% 0px', threshold: 0 });
    sections.forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menuOpen) { setMenuOpen(false); menuButton.current?.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  async function copyEmail() {
    clearTimeout(copyTimer.current);
    try {
      await navigator.clipboard.writeText(profile.email);
      setCopyStatus('邮箱已复制，期待你的来信！');
    } catch {
      setCopyStatus(`请手动复制邮箱：${profile.email}`);
    }
    copyTimer.current = setTimeout(() => setCopyStatus(''), 6000);
  }

  return <>
    <a className="skip-link" href="#main">跳到主要内容</a>
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href="#home" aria-label="Alicia 首页" onClick={() => setMenuOpen(false)}><span className="brand-symbol"><Icon name="cloud" /></span><span>Alicia<span className="brand-dot">.</span></span><span className="brand-note">小小的个人宇宙</span></a>
        <nav id="primary-navigation" className={`nav-links ${menuOpen ? 'is-open' : ''}`} aria-label="主导航">
          {navigation.map(item => <a key={item.id} href={`#${item.id}`} className={active === item.id ? 'is-active' : ''} aria-current={active === item.id ? 'location' : undefined} onClick={() => { setActive(item.id); setMenuOpen(false); }}>{item.label}</a>)}
        </nav>
        <div className="header-actions">
          <button className="icon-button theme-toggle" onClick={() => setTheme(theme === 'day' ? 'night' : 'day')} aria-label={theme === 'day' ? '切换到夜空主题' : '切换到晴空主题'} title={theme === 'day' ? '切换到夜空主题' : '切换到晴空主题'}><Icon name={theme === 'day' ? 'sun' : 'moon'} /></button>
          <span className="header-divider" />
          <a className="icon-button github-button" href={profile.github} target="_blank" rel="noreferrer" aria-label="访问 Alicia 的 GitHub（新窗口）"><Icon name="github" /></a>
          <button ref={menuButton} className="icon-button mobile-menu-button" aria-label={menuOpen ? '收起导航菜单' : '展开导航菜单'} aria-expanded={menuOpen} aria-controls="primary-navigation" onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? 'close' : 'menu'} /></button>
        </div>
      </div>
    </header>

    <main id="main">
      <section className="hero" id="home" aria-labelledby="hero-title">
        <img className="hero-image" src={`${import.meta.env.BASE_URL}images/summer-sky.webp`} alt="蓝天与白云下，银蓝色长发的动漫少女站在海边，回头微笑" fetchPriority="high" width="1536" height="1024" />
        <div className="hero-wash" />
        <div className="hero-inner page-width">
          <div className="hero-copy">
            <div className="hero-eyebrow"><span className="tiny-line" />HELLO, WORLD<span className="tiny-star">✧</span></div>
            <h1 id="hero-title"><span className="hello-line">你好，我是</span><span className="hero-name">{profile.name}<span className="name-dot">.</span><svg className="name-underline" viewBox="0 0 280 19" aria-hidden="true"><path d="M3 13C73 2 158 2 276 9M74 17c58-6 99-7 151-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></span><span className="name-sparkle" aria-hidden="true">✦</span></h1>
            <p className="hero-subtitle">在代码与蓝天之间，<br className="mobile-break" />收集每一份好奇心。</p>
            <p className="hero-description">{profile.intro}<br />探索计算的边界，也珍惜生活里的小小浪漫。</p>
            <div className="hero-buttons"><a className="button button-primary" href="#about">认识一下<Icon name="arrow" /></a><a className="button button-ghost" href={profile.github} target="_blank" rel="noreferrer"><Icon name="github" />我的 GitHub<Icon name="arrow" className="diagonal-arrow" /></a></div>
            <div className="hero-status"><span className="status-dot" /><span>保持好奇，持续探索中</span><span className="status-separator">/</span><span className="small-japanese" lang="ja">のんびり、前へ。</span></div>
          </div>
          <div className="sky-note"><span className="sky-note-icon"><Icon name="sun" /></span><div><span className="sky-note-label">TODAY'S MOOD</span><p>心里有光，晴空万里。</p></div><span className="sky-note-star" aria-hidden="true">✧</span></div>
          <span className="hero-side-note" aria-hidden="true">A LITTLE CORNER OF MY UNIVERSE</span>
        </div>
        <a className="scroll-cue" href="#about"><span>SCROLL TO EXPLORE</span><Icon name="down" /></a>
        <span className="hero-japanese" lang="ja" aria-hidden="true">青い空、まだ見ぬ世界。</span>
      </section>

      <div className="introduction-strip"><div className="page-width"><span><Icon name="code" />代码构筑世界</span><i>✧</i><span><Icon name="book" />好奇驱动探索</span><i>✧</i><span><Icon name="heart" />热爱点亮日常</span><span className="strip-ending">Nice to meet you <span>↗</span></span></div></div>

      <section className="about-section section-space page-width" id="about" aria-labelledby="about-title">
        <div className="section-heading"><div><p className="eyebrow"><span /> A LITTLE ABOUT ME</p><h2 id="about-title">很高兴，在这里遇见你<span className="heading-dot">。</span></h2></div><span className="section-aside" lang="ja">はじめまして <span>✳</span></span></div>
        <div className="about-layout">
          <aside className="profile-card"><div className="profile-decoration" aria-hidden="true">✧</div><div className="avatar"><img src={`${import.meta.env.BASE_URL}images/summer-sky.webp`} alt="Alicia 的动漫形象" width="112" height="112" loading="lazy" /></div><span className="profile-sticker">HELLO!</span><h3>{profile.fullName}</h3><a href={profile.github} target="_blank" rel="noreferrer">{profile.handle}</a><div className="profile-divider"/><p><Icon name="book"/>Student & lifelong learner</p><p><Icon name="cloud"/>在自己的时区里，慢慢生长</p><span className="profile-card-footer">MORE THAN A README <span>✦</span></span></aside>
          <div className="about-copy"><span className="about-hello">Hi, I'm YangBo <span aria-hidden="true">✌</span></span><h3>一个喜欢追问「为什么」的人。</h3><p>{profile.description}</p><p>目前正在探索高性能数值计算、GPU 编程与机器学习系统。对我来说，学习的乐趣，就藏在「原来如此」的那一刻。</p><div className="skill-list" aria-label="技术兴趣">{profile.skills.map(skill => <span key={skill}>{skill}</span>)}</div><div className="about-quote"><Icon name="sparkles"/><p>把复杂的问题想明白，<br className="quote-break"/>把简单的日子过有趣。</p></div></div>
          <div className="now-card"><div className="now-card-top"><span className="status-dot"/>此刻的我<span>NOW</span></div><div className="now-item"><span className="now-icon"><Icon name="code" /></span><div><span>正在探索</span><p>GPU 的并行世界</p></div></div><div className="now-item"><span className="now-icon"><Icon name="book" /></span><div><span>持续学习</span><p>数值计算与 ML 系统</p></div></div><div className="now-card-bottom"><Icon name="cloud"/><p>前路漫漫，<br />每一步都算数。</p><span aria-hidden="true">✦</span></div></div>
        </div>
      </section>

      <section className="explore-section section-space" id="explore" aria-labelledby="explore-title"><div className="page-width"><div className="section-heading"><div><p className="eyebrow"><span /> FOLLOW MY CURIOSITY</p><h2 id="explore-title">探索中的世界<span className="heading-dot">。</span></h2></div><p className="section-description">以好奇心为坐标，<br />让每一次探索都有迹可循。</p></div><div className="interest-grid">{interests.map(item => <article className="interest-card" key={item.id}><div className="interest-visual"><span className="card-number">/{item.number}</span><InterestArtwork kind={item.id}/><span className="visual-corner" aria-hidden="true">✦</span></div><div className="interest-content"><p className="card-eyebrow">{item.english}</p><h3>{item.title}</h3><p className="interest-description">{item.description}</p><div className="interest-tags">{item.tags.map(tag => <span key={tag}>{tag}</span>)}</div><button className="interest-link" onClick={() => setInterest(item)} aria-label={`了解${item.subtitle}`}>探索这个方向<Icon name="arrow" /></button></div></article>)}</div><p className="explore-footnote"><span>✧</span> 未完待续，下一段故事正在路上。</p></div></section>

      <section className="contact-section section-space page-width" id="contact" aria-labelledby="contact-title"><div className="contact-card"><div className="contact-orbit" aria-hidden="true"><Icon name="mail"/><span>✧</span></div><div className="contact-copy"><p className="eyebrow">LET'S SAY HELLO</p><h2 id="contact-title">让两个小小的世界，产生交集。</h2><p>关于技术、学习，或是一个有趣的想法，都欢迎来信。</p><div className="contact-actions"><a className="button button-primary" href={`mailto:${profile.email}`}><Icon name="mail"/>写一封信<Icon name="arrow"/></a><button className="email-copy" onClick={copyEmail} aria-label="复制邮箱地址"><span>{profile.email}</span><Icon name={copyStatus.startsWith('邮箱已复制') ? 'check' : 'copy'}/></button></div><p className="copy-status" role="status">{copyStatus}</p></div><span className="contact-stamp" aria-hidden="true">WITH A LITTLE<br/><Icon name="heart"/> CURIOSITY</span></div></section>
    </main>

    <footer className="site-footer page-width"><div><a className="footer-brand" href="#home"><Icon name="cloud"/>Alicia.</a><span>© {new Date().getFullYear()} {profile.fullName}</span></div><p>代码有逻辑，生活有诗意。<span>✧</span></p><a href="#home">回到晴空<Icon name="arrow" className="up-arrow"/></a></footer>
    <InterestDialog interest={interest} close={() => setInterest(null)} />
  </>;
}
