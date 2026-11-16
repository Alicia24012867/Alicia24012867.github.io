import type { IconName } from '../components/Icon';
import { moods } from '../config/moods.ts';

export type SkyPeriod = keyof typeof moods;

const icons: Record<SkyPeriod, IconName> = { day: 'sun', evening: 'sunset', night: 'moon' };

export function skyPeriod(date: Date): SkyPeriod {
  const hour = date.getHours();
  if (hour < 6 || hour >= 20) return 'night';
  return hour < 17 ? 'day' : 'evening';
}

/** The mood for a local time. Nights run past midnight, so a mood day begins at 6:00. */
export function skyMood(date: Date) {
  const period = skyPeriod(date);
  const dawn = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - +(date.getHours() < 6),
  );
  // Calendar days counted in UTC stay whole numbers across daylight saving changes.
  const day = Date.UTC(dawn.getFullYear(), dawn.getMonth(), dawn.getDate()) / 86_400_000;
  const { label, lines } = moods[period];
  return { period, label, icon: icons[period], line: lines[day % lines.length] };
}

/** The next local time at which the mood changes. */
export function nextSkyChange(date: Date) {
  const [year, month, day] = [date.getFullYear(), date.getMonth(), date.getDate()];
  return [
    new Date(year, month, day, 6),
    new Date(year, month, day, 17),
    new Date(year, month, day, 20),
    new Date(year, month, day + 1, 6),
  ].find((change) => change > date)!;
}
