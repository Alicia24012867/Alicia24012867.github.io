import { memo, useEffect, useId, useRef } from 'react';
import { strokes } from './signature-strokes';
import { strokeKeyframes } from './signature-motion';
import './signature.css';

// Each physical stroke owns its outline and mask. Shared crossing ink
// keeps the pen continuous without revealing a later stroke's branches.
const positions = [0, 847, 1081, 1307, 1619, 1845, 1081, 1619];

const writtenAt = strokes[strokes.length - 1].end;
const hold = 2;
const duration = writtenAt * 2 + hold + 0.5;

function HandwrittenSignature() {
  const id = useId();
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    let animations: Animation[] = [];
    const syncPlayback = () => {
      for (const animation of animations) {
        if (visible && !document.hidden) animation.play();
        else animation.pause();
      }
    };
    const setup = () => {
      animations.forEach((animation) => animation.cancel());
      animations = [];
      if (reducedMotion.matches) return;
      svg.querySelectorAll<SVGPathElement>('[data-pen]').forEach((path, index) => {
        const animation = path.animate(strokeKeyframes(strokes[index], writtenAt, hold, duration), {
          duration: duration * 1000,
          iterations: Infinity,
        });
        animation.pause();
        animation.currentTime = 0;
        animations.push(animation);
      });
      syncPlayback();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncPlayback();
    });
    observer.observe(svg);
    reducedMotion.addEventListener('change', setup);
    document.addEventListener('visibilitychange', syncPlayback);
    setup();
    return () => {
      observer.disconnect();
      reducedMotion.removeEventListener('change', setup);
      document.removeEventListener('visibilitychange', syncPlayback);
      animations.forEach((animation) => animation.cancel());
    };
  }, []);

  return (
    <div className="handwritten-signature">
      <svg
        ref={svgRef}
        viewBox="-35 -650 2460 810"
        role="img"
        aria-label="Alicia"
        focusable="false"
      >
        <defs>
          {strokes.map((stroke, index) => (
            <mask
              key={index}
              id={`${id}-${index}`}
              maskUnits="userSpaceOnUse"
              x="-50"
              y="-120"
              width="1400"
              height="800"
            >
              <path
                data-pen=""
                d={stroke.d}
                pathLength="1"
                fill="none"
                stroke="white"
                strokeWidth={stroke.width}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </mask>
          ))}
        </defs>
        <g className="signature-animated" transform="scale(1 -1)" fill="currentColor">
          {strokes.map((stroke, index) => (
            <path
              key={index}
              d={stroke.outline}
              transform={`translate(${positions[stroke.letter]} 0)`}
              mask={`url(#${id}-${index})`}
            />
          ))}
        </g>
        <g className="signature-static" transform="scale(1 -1)" fill="currentColor">
          {strokes.map((stroke, index) => (
            <path
              key={index}
              d={stroke.outline}
              transform={`translate(${positions[stroke.letter]} 0)`}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

export default memo(HandwrittenSignature);
