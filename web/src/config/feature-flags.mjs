/**
 * The parts of the site that need the blog API (server/, see docs/api/README.md). Each stays
 * off, and the site keeps working as it did before, until the backend's matching feature
 * passes the contract checks and is deployed; then it is added to `liveFeatures`, one at a time.
 *
 *   private        locked documents open after signing in, instead of with a password
 *   comments       comments and the guestbook on this site, instead of giscus
 *   stats          views and likes
 *   moments        the Moments page shows posts from the API
 *   subscriptions  email for new posts, from the footer
 *
 * VITE_FEATURES turns on more for one run, to try them against the stand-in API:
 *
 *   VITE_FEATURES=all npm run dev
 *   VITE_FEATURES=comments,stats npm run dev
 */
export const allFeatures = /** @type {const} */ ([
  'private',
  'comments',
  'stats',
  'moments',
  'subscriptions',
]);

/** @type {(typeof allFeatures)[number][]} The features that are live. */
export const liveFeatures = [];

/** The features on, given VITE_FEATURES. */
export function featuresOn(/** @type {string | undefined} */ asked) {
  const names = String(asked ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  return new Set(names.includes('all') ? allFeatures : [...liveFeatures, ...names]);
}
