export type RepoActivity = { name: string; url: string; pushedAt: string; description: string };

/** A fetched or stored entry, checked again before it becomes a link. */
export function repoActivity(value: unknown): RepoActivity | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { name, url, pushedAt, description } = value as Record<string, unknown>;
  if (typeof name !== 'string' || !name) return undefined;
  if (typeof url !== 'string' || !url.startsWith('https://github.com/')) return undefined;
  if (typeof pushedAt !== 'string' || Number.isNaN(Date.parse(pushedAt))) return undefined;
  return { name, url, pushedAt, description: typeof description === 'string' ? description : '' };
}

/**
 * The most recently pushed public project in a GitHub repository listing, sorted by
 * push time. Forks, archives and the profile README repository are skipped.
 */
export function latestRepo(repos: unknown, user: string): RepoActivity | undefined {
  if (!Array.isArray(repos)) return undefined;
  for (const repo of repos) {
    if (!repo || typeof repo !== 'object' || repo.fork || repo.archived || repo.private) continue;
    if (typeof repo.name === 'string' && repo.name.toLowerCase() === user.toLowerCase()) continue;
    const activity = repoActivity({
      name: repo.name,
      url: repo.html_url,
      pushedAt: repo.pushed_at,
      description: repo.description,
    });
    if (activity) return activity;
  }
  return undefined;
}

/** The GitHub Pages repository is this website itself. */
export const repoLabel = (name: string, user: string) =>
  name.toLowerCase() === `${user.toLowerCase()}.github.io` ? 'This website' : name;

const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86_400_000],
  ['month', 30 * 86_400_000],
  ['week', 7 * 86_400_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
];
let relative: Intl.RelativeTimeFormat | undefined;

/** "just now", "12 min ago", "5 hours ago", "yesterday", "last week"… */
export function timeAgo(then: number, now: number) {
  const elapsed = Math.max(0, now - then);
  if (elapsed < 60_000) return 'just now';
  // The short form keeps a fresh push on one line in the narrow card.
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min ago`;
  const [unit, size] = units.find(([, size]) => elapsed >= size)!;
  relative ??= new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  return relative.format(-Math.floor(elapsed / size), unit);
}

/** A post's calendar day, such as "Oct 3", with the year once it is not this year. */
export function postDay(date: string, now: Date) {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: year === now.getFullYear() ? undefined : 'numeric',
    timeZone: 'UTC',
  }).format(Date.UTC(year, month - 1, day));
}
