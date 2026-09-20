import { useState } from 'react';
import Icon from '../components/Icon';
import { interests, type Interest } from '../config/interests';
import InterestArtwork from './InterestArtwork';
import InterestDialog from './InterestDialog';

export default function Explore() {
  const [interest, setInterest] = useState<Interest | null>(null);
  return (
    <>
      <section
        className="explore-section section-space"
        id="explore"
        aria-labelledby="explore-title"
      >
        <div className="page-width">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                <span /> FOLLOW MY CURIOSITY
              </p>
              <h2 id="explore-title">
                What I am exploring<span className="heading-dot">.</span>
              </h2>
            </div>
            <p className="section-description">
              Guided by curiosity, <br />
              one discovery at a time.
            </p>
          </div>
          <div className="interest-grid">
            {interests.map((item) => (
              <article className="interest-card" key={item.id}>
                <div className="interest-visual">
                  <span className="card-number">/{item.number}</span>
                  <InterestArtwork kind={item.id} />
                  <span className="visual-corner" aria-hidden="true">
                    ✦
                  </span>
                </div>
                <div className="interest-content">
                  <p className="card-eyebrow">{item.english}</p>
                  <h3>{item.title}</h3>
                  <p className="interest-description">{item.description}</p>
                  <div className="interest-tags">
                    {item.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <button
                    className="interest-link"
                    onClick={() => setInterest(item)}
                    aria-label={`Explore ${item.subtitle}`}
                  >
                    Explore this topic
                    <Icon name="arrow" />
                  </button>
                </div>
              </article>
            ))}
          </div>
          <p className="explore-footnote">
            <span>✧</span> More to discover. The next chapter is on its way.
          </p>
        </div>
      </section>
      <InterestDialog interest={interest} close={() => setInterest(null)} />
    </>
  );
}
