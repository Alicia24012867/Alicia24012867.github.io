import { memo, useEffect, useId, useRef } from 'react';
import signatureStrokes, { signatureOutlines } from './signatureStrokes';

const cycleDuration = 10_000;
const animation = { dur: `${cycleDuration}ms`, begin: '0s', repeatCount: 'indefinite' };
const completeInk = signatureOutlines.join(' ');
let elapsed = 0;
const strokes = signatureStrokes.map(({ duration, progress, ...stroke }) => {
  const start = elapsed / cycleDuration;
  elapsed += duration;
  const end = elapsed / cycleDuration;
  const values = progress ? [1, 1 - progress[0], 0] : [1, 0];
  const times = progress ? [start, start + (end - start) * progress[1], end] : [start, end];
  if (start > 0) {
    values.unshift(1);
    times.unshift(0);
  }
  values.push(0);
  times.push(1);
  return { ...stroke, start, values: values.join(';'), keyTimes: times.join(';') };
});
const completeAt = elapsed / cycleDuration;

const ArticleSignature = memo(function ArticleSignature() {
  const svgRef = useRef<SVGSVGElement>(null);
  const clipId = useId();

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = typeof IntersectionObserver === 'undefined';
    const update = () => {
      if (visible && !document.hidden && !reducedMotion.matches) {
        svg.unpauseAnimations();
      } else {
        svg.pauseAnimations();
      }
    };
    svg.pauseAnimations();
    svg.setCurrentTime(0);
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? undefined
        : new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            update();
          });
    observer?.observe(svg);
    document.addEventListener('visibilitychange', update);
    reducedMotion.addEventListener('change', update);
    update();
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', update);
      reducedMotion.removeEventListener('change', update);
    };
  }, []);

  return (
    <div className="article-signature">
      <svg ref={svgRef} viewBox="18 29 204 93" role="img" aria-label="Alicia" focusable="false">
        <defs>
          {signatureOutlines.map((d, index) => (
            <path key={index} id={`${clipId}-ink-${index}`} d={d} />
          ))}
          {strokes.map(({ outlines }, index) => (
            <clipPath key={index} id={`${clipId}-${index}`}>
              {outlines.map((outline) => (
                <use key={outline} href={`#${clipId}-ink-${outline}`} />
              ))}
            </clipPath>
          ))}
        </defs>
        <g className="signature-ink" aria-hidden="true">
          <animate
            attributeName="opacity"
            values="1;1;0;0"
            keyTimes="0;0.72;0.82;1"
            {...animation}
          />
          <g
            className="signature-writing"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <animate
              attributeName="opacity"
              values="1;0;0"
              keyTimes={`0;${completeAt};1`}
              calcMode="discrete"
              {...animation}
            />
            {strokes.map(({ d, width, start, values, keyTimes }, index) => (
              <path
                key={index}
                d={d}
                clipPath={`url(#${clipId}-${index})`}
                strokeWidth={width}
                strokeDasharray="1 2"
                strokeDashoffset="1"
                pathLength="1"
                visibility={start === 0 ? 'visible' : 'hidden'}
              >
                {start > 0 && (
                  <animate
                    attributeName="visibility"
                    values="hidden;visible;visible"
                    keyTimes={`0;${start};1`}
                    calcMode="discrete"
                    {...animation}
                  />
                )}
                <animate
                  attributeName="stroke-dashoffset"
                  values={values}
                  keyTimes={keyTimes}
                  {...animation}
                />
              </path>
            ))}
          </g>
          <path
            className="signature-complete"
            d={completeInk}
            fill="currentColor"
            visibility="hidden"
          >
            <animate
              attributeName="visibility"
              values="hidden;visible;visible"
              keyTimes={`0;${completeAt};1`}
              calcMode="discrete"
              {...animation}
            />
          </path>
        </g>
      </svg>
    </div>
  );
});

export default ArticleSignature;
