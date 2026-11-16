import { useEffect, useRef } from 'react';
import Icon from '../components/Icon';
import type { Interest } from '../config/interests';

export default function InterestDialog({
  interest,
  close,
}: {
  interest: Interest | null;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!interest || !dialog) return;
    dialog.showModal();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = oldOverflow;
    };
  }, [interest]);

  return (
    <dialog
      ref={ref}
      className="interest-dialog"
      aria-labelledby="interest-title"
      onCancel={close}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          close();
      }}
    >
      {interest && (
        <>
          <button
            className="icon-button dialog-close"
            aria-label="Close details"
            onClick={close}
            autoFocus
          >
            <Icon name="close" />
          </button>
          <span className="eyebrow">EXPLORING / {interest.number}</span>
          <h2 id="interest-title">{interest.title}</h2>
          <p className="dialog-subtitle">{interest.subtitle}</p>
          <p>{interest.detail}</p>
          <h3>Questions to explore</h3>
          <ul>
            {interest.topics.map((topic) => (
              <li key={topic}>{topic}</li>
            ))}
          </ul>
          <h3>Explore further</h3>
          <div className="resource-links">
            {interest.links.map((link) => (
              <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
                {link.label}
                <Icon name="arrow" />
              </a>
            ))}
          </div>
          <p className="dialog-note">
            These are the topics I am learning about. Always happy to exchange ideas.
          </p>
        </>
      )}
    </dialog>
  );
}
