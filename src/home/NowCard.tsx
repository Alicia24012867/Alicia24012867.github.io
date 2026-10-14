import { useEffect, useRef, useState, type RefObject } from 'react';
import latestPost from 'virtual:articles/latest';
import Icon from '../components/Icon';
import { profile } from '../config/profile';
import { latestRepo, postDay, repoActivity, repoLabel, timeAgo } from './activity';

const user = new URL(profile.github).pathname.split('/')[1] ?? '';
// GitHub answers 60 anonymous requests an hour per network address, so a visitor
// asks at most every half hour and keeps the last answer for when GitHub declines.
const cacheKey = 'alicia-github-activity';
const freshFor = 30 * 60_000;

function cached() {
  try {
    const entry = JSON.parse(localStorage.getItem(cacheKey) ?? 'null');
    const repo = repoActivity(entry?.repo);
    return repo && typeof entry.at === 'number' ? { at: entry.at as number, repo } : undefined;
  } catch {
    return undefined;
  }
}

/** The most recently pushed project, requested once the card is about to scroll into view. */
function useLatestRepo(card: RefObject<HTMLElement | null>) {
  const [repo, setRepo] = useState(() => cached()?.repo);
  useEffect(() => {
    const element = card.current;
    const age = Date.now() - (cached()?.at ?? -Infinity);
    if (!element || !user || (age >= 0 && age < freshFor)) return;
    const controller = new AbortController();
    const load = () =>
      fetch(`https://api.github.com/users/${user}/repos?sort=pushed&per_page=5`, {
        signal: controller.signal,
        referrerPolicy: 'no-referrer',
      })
        .then((response) => (response.ok ? response.json() : undefined))
        .then((repos) => {
          const latest = latestRepo(repos, user);
          if (!latest) return;
          setRepo(latest);
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), repo: latest }));
          } catch {
            /* The card works without storage. */
          }
        })
        .catch(() => {
          // Offline, blocked or rate limited: the line keeps its last answer or the profile link.
        });
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void load();
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      controller.abort();
    };
  }, [card]);
  return repo;
}

/** Two chosen topics, then the latest GitHub push and the newest post as quieter lines. */
export default function NowCard() {
  const card = useRef<HTMLDivElement>(null);
  const repo = useLatestRepo(card);
  return (
    <div className="now-card" ref={card}>
      <div className="now-card-top">
        <span className="status-dot" />
        Right now<span>NOW</span>
      </div>
      <div className="now-items">
        <div className="now-item">
          <span className="now-icon">
            <Icon name="code" />
          </span>
          <div>
            <span>Exploring</span>
            <p>GPU parallelism</p>
          </div>
        </div>
        <div className="now-item">
          <span className="now-icon">
            <Icon name="book" />
          </span>
          <div>
            <span>Learning</span>
            <p>Numerics & ML systems</p>
          </div>
        </div>
        <ul className="now-recent" aria-label="Recent activity">
          <li>
            <Icon name="github" />
            <a
              href={repo?.url ?? profile.github}
              target="_blank"
              rel="noreferrer"
              title={repo && [repo.name, repo.description].filter(Boolean).join(': ')}
              aria-label={repo ? `Latest push on GitHub: ${repo.name}` : undefined}
            >
              {repo ? repoLabel(repo.name, user) : 'Projects on GitHub'}
            </a>
            {repo && (
              <time dateTime={repo.pushedAt}>{timeAgo(Date.parse(repo.pushedAt), Date.now())}</time>
            )}
          </li>
          {latestPost && (
            <li>
              <Icon name="pen" />
              <a
                href={latestPost.path}
                title={latestPost.title}
                aria-label={`Newest post: ${latestPost.title}`}
              >
                {latestPost.title}
              </a>
              <time dateTime={latestPost.date}>{postDay(latestPost.date, new Date())}</time>
            </li>
          )}
        </ul>
      </div>
      <div className="now-card-bottom">
        <Icon name="cloud" />
        <p>
          A long road ahead. <br />
          Every step counts.
        </p>
        <span aria-hidden="true">✦</span>
      </div>
    </div>
  );
}
