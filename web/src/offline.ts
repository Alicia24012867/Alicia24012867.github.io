/**
 * Lets the browser keep the pages read here for reading again offline (`public/sw.js`). Only
 * the built site has the worker; the development server always serves the newest files.
 */
export function keepForOffline() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const workers = navigator.serviceWorker;
  // A first visit has loaded before the worker could see it: the worker is told what it was.
  if (!workers.controller)
    workers.addEventListener(
      'controllerchange',
      () => {
        workers.controller?.postMessage({
          type: 'keep',
          page: location.href,
          files: performance.getEntriesByType('resource').map((entry) => entry.name),
        });
      },
      { once: true },
    );
  const register = () => {
    workers.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
      // Without the worker the site works as before, online only.
    });
  };
  // After the page has everything it needs, so the worker never competes with it.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
