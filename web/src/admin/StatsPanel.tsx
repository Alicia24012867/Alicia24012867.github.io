import { useCallback, useState } from 'react';
import { api } from '../api/client';
import type { AdminStats } from '../api/types';
import { Status, useLoad } from './shared';

const spans = [7, 30, 90] as const;
const number = (value: number) => value.toLocaleString('en-US');

/** Views a day, and each page's views, likes and comments. */
export default function StatsPanel() {
  const [days, setDays] = useState<number>(30);
  const load = useCallback(() => api<AdminStats>(`/api/admin/stats?days=${days}`), [days]);
  const { value: stats, error } = useLoad(load);
  const most = Math.max(1, ...(stats?.days.map((day) => day.views) ?? []));
  const total = stats?.days.reduce((sum, day) => sum + day.views, 0) ?? 0;

  return (
    <section className="admin-panel" aria-labelledby="stats-heading">
      <h1 id="stats-heading">Stats</h1>
      <div className="admin-filters" role="group" aria-label="Days">
        {spans.map((span) => (
          <button
            key={span}
            type="button"
            className={days === span ? 'is-active' : undefined}
            aria-pressed={days === span}
            onClick={() => setDays(span)}
          >
            {span} days
          </button>
        ))}
      </div>
      <Status error={error} loading={!stats && !error} />
      {stats && (
        <>
          <p className="admin-big">
            {number(total)} <span>views in {days} days</span>
          </p>
          <div className="admin-bars" role="img" aria-label={`Views a day over ${days} days`}>
            {stats.days.map((day) => (
              <span
                key={day.date}
                style={{ height: `${Math.max(2, (day.views / most) * 100)}%` }}
                title={`${day.date}: ${number(day.views)} views`}
              />
            ))}
          </div>
          <p className="admin-axis">
            <span>{stats.days[0]?.date}</span>
            <span>{stats.days.at(-1)?.date}</span>
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Page</th>
                  <th scope="col">Views</th>
                  <th scope="col">Likes</th>
                  <th scope="col">Comments</th>
                </tr>
              </thead>
              <tbody>
                {stats.pages.map((page) => (
                  <tr key={page.path}>
                    <th scope="row">
                      <a href={page.path}>{page.path}</a>
                    </th>
                    <td>{number(page.views)}</td>
                    <td>{number(page.likes)}</td>
                    <td>{number(page.comments)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
