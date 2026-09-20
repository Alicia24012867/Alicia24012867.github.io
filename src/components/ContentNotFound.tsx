import { listingUrl, queryFromSearch } from '../content/urls';
import Icon from './Icon';

export default function ContentNotFound({ kind }: { kind: 'post' | 'note' }) {
  return (
    <div className="journal-width journal-empty missing-article">
      <Icon name="cloud" />
      <p className="eyebrow">PAGE NOT FOUND</p>
      <h1>This {kind} is not here yet.</h1>
      <p>It may have moved or may still be a draft.</p>
      <a
        className="button button-primary"
        href={listingUrl(queryFromSearch(window.location.search))}
      >
        Back to all {kind}s<Icon name="arrow" />
      </a>
    </div>
  );
}
