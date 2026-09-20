import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { profile } from '../config/profile';

export default function Contact() {
  const [copyStatus, setCopyStatus] = useState('');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  async function copyEmail() {
    clearTimeout(copyTimer.current);
    try {
      await navigator.clipboard.writeText(profile.email);
      setCopyStatus('Email copied. Looking forward to hearing from you!');
    } catch {
      setCopyStatus(`Please copy this email address: ${profile.email}`);
    }
    copyTimer.current = setTimeout(() => setCopyStatus(''), 6000);
  }

  return (
    <section
      className="contact-section section-space page-width"
      id="contact"
      aria-labelledby="contact-title"
    >
      <div className="contact-card">
        <div className="contact-orbit" aria-hidden="true">
          <Icon name="mail" />
          <span>✧</span>
        </div>
        <div className="contact-copy">
          <p className="eyebrow">LET'S SAY HELLO</p>
          <h2 id="contact-title">Let our worlds meet.</h2>
          <p>Have a question about code, learning, or an interesting idea? Say hello.</p>
          <div className="contact-actions">
            <a className="button button-primary" href={`mailto:${profile.email}`}>
              <Icon name="mail" />
              Send an email
              <Icon name="arrow" />
            </a>
            <button className="email-copy" onClick={copyEmail} aria-label="Copy email address">
              <span>{profile.email}</span>
              <Icon name={copyStatus.startsWith('Email copied') ? 'check' : 'copy'} />
            </button>
          </div>
          <p className="copy-status" role="status">
            {copyStatus}
          </p>
        </div>
        <span className="contact-stamp" aria-hidden="true">
          WITH A LITTLE
          <br />
          <Icon name="heart" /> CURIOSITY
        </span>
      </div>
    </section>
  );
}
