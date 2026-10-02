import { useEffect } from 'react';

function setMeta(selector: string, content: string) {
  document.querySelector(selector)?.setAttribute('content', content);
}

/** Keep the document head in sync while a client-rendered route is on screen. */
export function usePageMeta({
  title,
  description,
  canonical,
}: {
  title: string;
  description: string;
  canonical?: string;
}) {
  useEffect(() => {
    document.title = title;
    setMeta('meta[name="description"]', description);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[name="twitter:description"]', description);
    if (canonical) {
      setMeta('meta[property="og:url"]', canonical);
      document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonical);
    }
  }, [title, description, canonical]);
}
