const interruptions = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
/** How long the spot is held after the last movement, for diagrams that draw late. */
const holdFor = 6000;

/**
 * Scrolls to `spot()`, a scroll position, and holds it there while content above it settles,
 * such as a diagram that draws as the page passes it, until the reader moves on or all is
 * still. The returned function stops holding.
 */
export function holdPlace(root: HTMLElement, spot: () => number) {
  const reachable = (top: number) =>
    Math.min(top, document.documentElement.scrollHeight - window.innerHeight);
  let target = spot();
  let arrived = false;
  let quiet = 0;
  const wait = () => {
    window.clearTimeout(quiet);
    quiet = window.setTimeout(stop, holdFor);
  };
  const check = () => {
    const next = spot();
    if (Math.abs(next - target) > 1) {
      // The text moved: aim the scroll anew on the way, or keep the line still once there.
      target = next;
      window.scrollTo({ top: target, behavior: arrived ? 'instant' : undefined });
    } else if (Math.abs(window.scrollY - reachable(target)) <= 1) {
      arrived = true;
    } else if (arrived) {
      // Leaving the spot after reaching it means the reader is scrolling on their own.
      return stop();
    }
    wait();
  };
  const resize = new ResizeObserver(check);
  const stop = () => {
    window.clearTimeout(quiet);
    resize.disconnect();
    window.removeEventListener('scroll', check);
    interruptions.forEach((type) => window.removeEventListener(type, stop));
  };
  window.scrollTo({ top: target });
  resize.observe(root);
  window.addEventListener('scroll', check, { passive: true });
  interruptions.forEach((type) => window.addEventListener(type, stop, { passive: true }));
  wait();
  return stop;
}
