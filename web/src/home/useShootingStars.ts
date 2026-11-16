import { useCallback, useEffect, type RefObject } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { starFlight, starKeyframes } from './shootingStar';

/**
 * Shooting stars cross the hero's sky now and then at night, while the hero is on
 * screen, and on request in either theme. Visitors who prefer reduced motion see none.
 */
export function useShootingStars(
  hero: RefObject<HTMLElement | null>,
  sky: RefObject<HTMLElement | null>,
) {
  const calm = useMediaQuery('(prefers-reduced-motion: reduce)');
  const launch = useCallback(
    (from?: { x: number; y: number }) => {
      const layer = sky.current;
      // A few at once at most, however quickly the sky is tapped.
      if (calm || !layer || layer.childElementCount >= 4) return;
      const flight = starFlight(layer.clientWidth, layer.clientHeight, Math.random, from);
      const star = document.createElement('span');
      star.className = 'shooting-star';
      star.style.width = `${flight.length}px`;
      layer.append(star);
      const animation = star.animate(starKeyframes(flight), {
        duration: flight.duration,
        easing: 'ease-out',
      });
      animation.onfinish = animation.oncancel = () => star.remove();
    },
    [calm, sky],
  );

  useEffect(() => {
    const element = hero.current;
    if (calm || !element) return;
    let timer = 0;
    let onScreen = false;
    // Soon after night falls or the sky comes back into view, then every 5 to 12 seconds.
    const schedule = (delay = 1500 + Math.random() * 1500) => {
      window.clearTimeout(timer);
      if (!onScreen || document.hidden || document.documentElement.dataset.theme !== 'night')
        return;
      timer = window.setTimeout(() => {
        launch();
        schedule(5000 + Math.random() * 7000);
      }, delay);
    };
    const reschedule = () => schedule();
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      schedule();
    });
    observer.observe(element);
    const theme = new MutationObserver(reschedule);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    document.addEventListener('visibilitychange', reschedule);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      theme.disconnect();
      document.removeEventListener('visibilitychange', reschedule);
    };
  }, [calm, hero, launch]);

  return launch;
}
