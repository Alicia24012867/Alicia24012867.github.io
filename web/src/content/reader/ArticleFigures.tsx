import {
  Component,
  Suspense,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { figures, isFigureName, type FigureName } from '../figures';

type Placed = { element: HTMLElement; name: FigureName };

class FigureBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="figure-status" role="alert">
        <p>This interactive figure couldn’t load.</p>
        <button className="button button-ghost" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }
}

// Placeholders hold the figure's height until its code arrives; then it sizes itself.
function Ready({ element, children }: { element: HTMLElement; children: ReactNode }) {
  useLayoutEffect(() => {
    element.classList.add('is-ready');
    return () => element.classList.remove('is-ready');
  }, [element]);
  return children;
}

/** Mounts each `figure[data-figure]` placeholder's component once it nears the screen. */
export default function ArticleFigures({ bodyRef }: { bodyRef: RefObject<HTMLElement | null> }) {
  const [placed, setPlaced] = useState<Placed[]>([]);

  useEffect(() => {
    const slots = [
      ...(bodyRef.current?.querySelectorAll<HTMLElement>('figure[data-figure]') ?? []),
    ];
    if (!slots.length) return;
    const place = (element: HTMLElement) => {
      const name = element.dataset.figure;
      if (!isFigureName(name)) return;
      setPlaced((list) =>
        list.some((item) => item.element === element) ? list : [...list, { element, name }],
      );
    };
    if (typeof IntersectionObserver === 'undefined') {
      slots.forEach(place);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          place(entry.target as HTMLElement);
        }
      },
      { rootMargin: '600px 0px' },
    );
    slots.forEach((slot) => observer.observe(slot));
    return () => observer.disconnect();
  }, [bodyRef]);

  return placed.map(({ element, name }, index) => {
    const Figure = figures[name];
    return createPortal(
      <FigureBoundary>
        <Suspense
          fallback={
            <p className="figure-status" role="status">
              Loading the interactive figure…
            </p>
          }
        >
          <Ready element={element}>
            <Figure />
          </Ready>
        </Suspense>
      </FigureBoundary>,
      element,
      `${name}-${index}`,
    );
  });
}
