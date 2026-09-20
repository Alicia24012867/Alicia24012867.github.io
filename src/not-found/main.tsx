import React from 'react';
import ReactDOM from 'react-dom/client';
import SiteLayout from '../components/layout/SiteLayout';
import Icon from '../components/Icon';
import '../styles/global.css';
import './not-found.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SiteLayout section="not-found">
      <section className="not-found" aria-labelledby="not-found-title">
        <img
          className="not-found-image"
          src={`${import.meta.env.BASE_URL}images/summer-sky.webp`}
          alt=""
          fetchPriority="high"
          width="1536"
          height="1024"
        />
        <div className="not-found-inner page-width">
          <div className="not-found-copy">
            <p className="eyebrow">
              <Icon name="cloud" /> A LITTLE OFF THE MAP
            </p>
            <h1 id="not-found-title">
              <span className="not-found-code">404</span>
              Page not found.
            </h1>
            <p className="not-found-description">
              This page may have moved, or the address may be misspelled.
              <br />
              There’s still plenty to explore under this sky.
            </p>
            <nav className="not-found-links" aria-label="Find your way back">
              <a className="button button-primary" href="/">
                Back to Home <Icon name="arrow" />
              </a>
              <a className="button button-ghost" href="/blog/">
                Blog <Icon name="arrow" />
              </a>
              <a className="button button-ghost" href="/notes/">
                Notes <Icon name="arrow" />
              </a>
            </nav>
          </div>
        </div>
      </section>
    </SiteLayout>
  </React.StrictMode>,
);
