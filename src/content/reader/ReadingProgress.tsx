import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { readingProgress } from './progress';

/** A thin line along the bottom of the site header that fills as the article is read. */
export default function ReadingProgress({ bodyRef }: { bodyRef: RefObject<HTMLElement | null> }) {
  const [header, setHeader] = useState<HTMLElement | null>(null);
  const line = useRef<HTMLSpanElement>(null);

  useEffect(() => setHeader(document.querySelector<HTMLElement>('.site-header')), []);

  useEffect(() => {
    const body = bodyRef.current;
    const bar = line.current;
    if (!header || !body || !bar) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const { top, height } = body.getBoundingClientRect();
      const progress = readingProgress(
        top,
        height,
        header.getBoundingClientRect().bottom,
        innerHeight,
      );
      // Moving the line, not resizing it, keeps scrolling off the layout path.
      bar.style.transform = `translateX(${(progress - 1) * 100}%)`;
      bar.style.opacity = progress > 0 ? '1' : '0';
    };
    const schedule = () => {
      frame ||= requestAnimationFrame(update);
    };
    update();
    // Images, diagrams and folded sections change the article's height after it renders.
    const resize = new ResizeObserver(schedule);
    resize.observe(body);
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      removeEventListener('scroll', schedule);
      removeEventListener('resize', schedule);
    };
  }, [bodyRef, header]);

  return (
    header &&
    createPortal(
      <div className="reading-progress" aria-hidden="true">
        <span ref={line} />
      </div>,
      header,
    )
  );
}
