import Icon from '../components/Icon';
import { profile } from '../config/profile';

export default function Hero() {
  return (
    <section className="hero" id="home" aria-labelledby="hero-title">
      <img
        className="hero-image"
        src={`${import.meta.env.BASE_URL}images/summer-sky.webp`}
        alt="An illustrated girl with silver-lilac hair and a star hairpin looking toward a blue sky above the sea"
        fetchPriority="high"
        width="1536"
        height="1024"
      />
      <div className="hero-wash" />
      <div className="hero-inner page-width">
        <div className="hero-copy">
          <div className="hero-eyebrow">
            <span className="tiny-line" />
            HELLO, WORLD<span className="tiny-star">✧</span>
          </div>
          <h1 id="hero-title">
            <span className="hello-line">Hello, I'm</span>
            <span className="hero-name">
              {profile.name}
              <span className="name-dot">.</span>
              <svg className="name-underline" viewBox="0 0 280 19" aria-hidden="true">
                <path
                  d="M3 13C73 2 158 2 276 9M74 17c58-6 99-7 151-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="name-sparkle" aria-hidden="true">
              ✦
            </span>
          </h1>
          <p className="hero-subtitle">
            Between code and blue skies, <br className="mobile-break" />
            following my curiosity.
          </p>
          <p className="hero-description">
            {profile.intro}
            <br />
            Exploring computing, finding wonder in everyday life.
          </p>
          <div className="hero-buttons">
            <a className="button button-primary" href="#about">
              Meet Alicia
              <Icon name="arrow" />
            </a>
            <a
              className="button button-ghost"
              href={profile.github}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="github" />
              My GitHub
              <Icon name="arrow" className="diagonal-arrow" />
            </a>
          </div>
          <div className="hero-status">
            <span className="status-dot" />
            <span>Stay curious. Keep exploring.</span>
            <span className="status-separator">/</span>
            <span className="small-japanese" lang="en">
              One step at a time.
            </span>
          </div>
        </div>
        <div className="sky-note">
          <span className="sky-note-icon">
            <Icon name="sun" />
          </span>
          <div>
            <span className="sky-note-label">TODAY'S MOOD</span>
            <p>A little light, a wide-open sky.</p>
          </div>
          <span className="sky-note-star" aria-hidden="true">
            ✧
          </span>
        </div>
        <span className="hero-side-note" aria-hidden="true">
          A LITTLE CORNER OF MY UNIVERSE
        </span>
      </div>
      <a className="scroll-cue" href="#about">
        <span>SCROLL TO EXPLORE</span>
        <Icon name="down" />
      </a>
      <span className="hero-japanese" lang="en" aria-hidden="true">
        Blue skies. New possibilities.
      </span>
    </section>
  );
}
