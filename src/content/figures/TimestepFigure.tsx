import './figures.css';
import { useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { circuit, defaults, exactCurve, simulate, source, tmax, type Step } from './timestep';

// The slider moves log10(reltol) in quarter decades.
const range = { min: -6, max: -2, step: 0.25 };
const defaultExponent = Math.log10(defaults.reltol);
const modes = [
  { compensate: false, name: 'ngspice 原式', note: '差商直接乘 trapCoeff' },
  { compensate: true, name: '补偿 (k+1)!', note: '差商再乘 (k+1)!：BE ×2，TRAP ×6' },
];

// Chart geometry in CSS pixels; only the width follows the figure.
const pad = { left: 46, right: 14 };
const wave = { top: 24, height: 150, min: -0.08, max: 1.12 };
const stepPanel = { top: 214, height: 106, min: Math.log10(3e-10), max: Math.log10(4e-7) };
const chartHeight = stepPanel.top + stepPanel.height + 26;
const timeTicks = [0, 2, 4, 6, 8, 10];
const voltTicks = [0, 0.5, 1];
const stepTicks = [1e-9, 1e-8, 1e-7];

// The source and its exact response never change; sample them once.
let curves: { input: [number, number][]; exact: [number, number][] } | undefined;
const sampledCurves = () =>
  (curves ??= {
    input: Array.from({ length: 801 }, (_, i) => {
      const t = (i / 800) * circuit.tstop;
      return [t, source(t)];
    }),
    exact: exactCurve(801),
  });

const digits = '⁻⁰¹²³⁴⁵⁶⁷⁸⁹';
const superscript = (value: number) =>
  String(value).replace(/[-\d]/g, (char) => digits[char === '-' ? 0 : Number(char) + 1]);
function formatTolerance(exponent: number) {
  const power = Math.floor(exponent + 1e-9);
  return `${(10 ** (exponent - power)).toFixed(1)} × 10${superscript(power)}`;
}
const formatError = (volts: number) =>
  (Math.abs(volts) >= 1e-3
    ? `${(volts * 1e3).toPrecision(3)} mV`
    : `${(volts * 1e6).toPrecision(3)} µV`
  ).replace('-', '−');
const formatStep = (seconds: number) => `${Number((seconds * 1e9).toPrecision(3))} ns`;

const fixed = (value: number) => value.toFixed(1);
const linePath = (points: [number, number][]) =>
  'M' + points.map(([x, y]) => `${fixed(x)},${fixed(y)}`).join('L');
const dotPath = (points: [number, number][], r: number) =>
  points
    .map(
      ([x, y]) =>
        `M${fixed(x - r)},${fixed(y)}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`,
    )
    .join('');
const crossPath = (points: [number, number][], size: number) =>
  points
    .map(
      ([x, y]) =>
        `M${fixed(x - size)},${fixed(y - size)}l${2 * size},${2 * size}m0,${-2 * size}l${-2 * size},${2 * size}`,
    )
    .join('');

function scales(width: number) {
  const plotWidth = width - pad.left - pad.right;
  return {
    plotWidth,
    x: (t: number) => pad.left + (t / circuit.tstop) * plotWidth,
    yVolt: (v: number) => wave.top + ((wave.max - v) / (wave.max - wave.min)) * wave.height,
    yStep: (h: number) => {
      const level = Math.min(stepPanel.max, Math.max(stepPanel.min, Math.log10(h)));
      const share = (stepPanel.max - level) / (stepPanel.max - stepPanel.min);
      return stepPanel.top + share * stepPanel.height;
    },
  };
}

function nearest(steps: Step[], t: number) {
  let low = 0;
  let high = steps.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (steps[middle].t < t) low = middle;
    else high = middle;
  }
  return t - steps[low].t <= steps[high].t - t ? low : high;
}

/** The step control of the note's Part 1 and 2, run live on a small RC circuit. */
export default function TimestepFigure() {
  const id = useId();
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [exponent, setExponent] = useState(defaultExponent);
  const [compensate, setCompensate] = useState(false);
  const [pointer, setPointer] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => setWidth(Math.max(260, Math.round(element.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const results = useMemo(
    () => modes.map((mode) => simulate(10 ** exponent, mode.compensate)),
    [exponent],
  );
  const run = results[compensate ? 1 : 0];

  const scale = useMemo(() => scales(width), [width]);
  const { plotWidth, x, yVolt, yStep } = scale;

  const paths = useMemo(() => {
    const { x, yVolt, yStep } = scale;
    const { input, exact } = sampledCurves();
    const wavePoints = run.steps.map(({ t, v }): [number, number] => [x(t), yVolt(v)]);
    const stepPoints = run.steps.slice(1).map(({ t, h }): [number, number] => [x(t), yStep(h)]);
    return {
      input: linePath(input.map(([t, v]) => [x(t), yVolt(v)])),
      exact: linePath(exact.map(([t, v]) => [x(t), yVolt(v)])),
      line: linePath(wavePoints),
      dots: dotPath(wavePoints, 2.1),
      steps: dotPath(stepPoints, 2.1),
      rejected: crossPath(
        run.rejected.map(({ t, h }) => [x(t), yStep(h)]),
        3,
      ),
    };
  }, [run, scale]);

  const focused = pointer === null ? undefined : run.steps[nearest(run.steps, pointer)];
  const worst = run.steps[run.worst];
  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const t = ((event.clientX - box.left - pad.left) / plotWidth) * circuit.tstop;
    setPointer(Math.min(circuit.tstop, Math.max(0, t)));
  };
  const summary = (index: number) => {
    const { steps, rejected, maxError } = results[index];
    return `${steps.length - 1} 步 · 拒绝 ${rejected.length} 次 · 最大误差 ${formatError(maxError)}`;
  };
  const isDefault = exponent === defaultExponent;

  return (
    <>
      <div className="timestep-figure" ref={frame}>
        <div className="timestep-tolerance">
          <label htmlFor={`${id}-reltol`}>reltol</label>
          <input
            id={`${id}-reltol`}
            type="range"
            min={range.min}
            max={range.max}
            step={range.step}
            value={exponent}
            aria-valuetext={formatTolerance(exponent) + (isDefault ? '，ngspice 缺省值' : '')}
            onChange={(event) => setExponent(Number(event.target.value))}
          />
          <output htmlFor={`${id}-reltol`}>{formatTolerance(exponent)}</output>
          <span className="timestep-default" hidden={!isDefault}>
            ngspice 缺省
          </span>
        </div>
        <fieldset className="timestep-modes">
          <legend className="visually-hidden">LTE 估计方式</legend>
          {modes.map((mode, index) => (
            <label
              key={mode.name}
              className={`timestep-mode${compensate === mode.compensate ? ' is-active' : ''}`}
            >
              <input
                type="radio"
                name={`${id}-mode`}
                checked={compensate === mode.compensate}
                onChange={() => setCompensate(mode.compensate)}
              />
              <span className="timestep-mode-name">{mode.name}</span>
              <span className="timestep-mode-note">{mode.note}</span>
              <span className="timestep-mode-stats">{summary(index)}</span>
            </label>
          ))}
        </fieldset>
        <ul className="timestep-legend">
          <li>
            <svg viewBox="0 0 22 10" aria-hidden="true">
              <path className="timestep-line" d="M1,5H21" />
              <path className="timestep-dots" d={dotPath([[11, 5]], 2.1)} />
            </svg>
            仿真：每个点是一个接受的时间点
          </li>
          <li>
            <svg viewBox="0 0 22 10" aria-hidden="true">
              <path className="timestep-exact" d="M1,5H21" />
            </svg>
            精确解
          </li>
          <li>
            <svg viewBox="0 0 22 10" aria-hidden="true">
              <path className="timestep-input" d="M1,5H21" />
            </svg>
            输入
          </li>
          <li>
            <svg viewBox="0 0 22 10" aria-hidden="true">
              <path className="timestep-rejected" d={crossPath([[11, 5]], 3)} />
            </svg>
            被拒绝的尝试
          </li>
          <li>
            <svg viewBox="0 0 22 10" aria-hidden="true">
              <circle className="timestep-worst" cx="11" cy="5" r="4.5" />
            </svg>
            最大误差处
          </li>
        </ul>
        <svg
          className="timestep-chart"
          width={width}
          height={chartHeight}
          viewBox={`0 0 ${width} ${chartHeight}`}
          role="img"
          aria-label={`仿真结果：${summary(compensate ? 1 : 0)}`}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') setPointer(null);
          }}
        >
          <rect
            className="timestep-panel"
            x={pad.left}
            y={wave.top}
            width={plotWidth}
            height={wave.height}
            rx="6"
          />
          <rect
            className="timestep-panel"
            x={pad.left}
            y={stepPanel.top}
            width={plotWidth}
            height={stepPanel.height}
            rx="6"
          />
          <text className="timestep-title" x={pad.left} y={wave.top - 9}>
            v(t)
          </text>
          <text className="timestep-title" x={pad.left} y={stepPanel.top - 9}>
            步长 h（对数坐标）
          </text>
          <g className="timestep-grid">
            {timeTicks.map((tick) => (
              <g key={tick}>
                <path d={`M${fixed(x(tick * 1e-6))},${wave.top}v${wave.height}`} />
                <path d={`M${fixed(x(tick * 1e-6))},${stepPanel.top}v${stepPanel.height}`} />
              </g>
            ))}
            {voltTicks.map((tick) => (
              <path key={tick} d={`M${pad.left},${fixed(yVolt(tick))}h${plotWidth}`} />
            ))}
            {stepTicks.map((tick) => (
              <path key={tick} d={`M${pad.left},${fixed(yStep(tick))}h${plotWidth}`} />
            ))}
          </g>
          <g className="timestep-axis">
            {voltTicks.map((tick) => (
              <text key={tick} x={pad.left - 8} y={yVolt(tick) + 4} textAnchor="end">
                {tick === 1 ? '1 V' : tick}
              </text>
            ))}
            {stepTicks.map((tick) => (
              <text key={tick} x={pad.left - 8} y={yStep(tick) + 4} textAnchor="end">
                {formatStep(tick)}
              </text>
            ))}
            {timeTicks.map((tick, index) => (
              <text
                key={tick}
                x={x(tick * 1e-6)}
                y={stepPanel.top + stepPanel.height + 18}
                textAnchor={
                  index === 0 ? 'start' : index === timeTicks.length - 1 ? 'end' : 'middle'
                }
              >
                {index === timeTicks.length - 1 ? `${tick} µs` : tick}
              </text>
            ))}
          </g>
          <path className="timestep-limit" d={`M${pad.left},${fixed(yStep(tmax))}h${plotWidth}`} />
          <text
            className="timestep-limit-label"
            x={pad.left + plotWidth - 6}
            y={yStep(tmax) - 5}
            textAnchor="end"
          >
            TMAX
          </text>
          <path className="timestep-input" d={paths.input} />
          <path className="timestep-exact" d={paths.exact} />
          <path className="timestep-line" d={paths.line} />
          <path className="timestep-dots" d={paths.dots} />
          <path className="timestep-dots" d={paths.steps} />
          <path className="timestep-rejected" d={paths.rejected} />
          <circle className="timestep-worst" cx={x(worst.t)} cy={yVolt(worst.v)} r="6" />
          {focused && (
            <g className="timestep-focus">
              <path d={`M${fixed(x(focused.t))},${wave.top}V${stepPanel.top + stepPanel.height}`} />
              <circle cx={x(focused.t)} cy={yVolt(focused.v)} r="4.5" />
              {focused.h > 0 && <circle cx={x(focused.t)} cy={yStep(focused.h)} r="4.5" />}
            </g>
          )}
        </svg>
        <p className="timestep-readout">
          {focused
            ? `t = ${(focused.t * 1e6).toFixed(3)} µs · ` +
              (focused.h > 0
                ? `h = ${formatStep(focused.h)} · ${focused.order === 1 ? 'BE（一阶）' : 'TRAP（二阶）'} · `
                : '直流工作点 · ') +
              `v = ${focused.v.toFixed(4)} V，误差 ${formatError(focused.v - focused.exact)}`
            : '悬停或点按图表，查看每一步的步长、阶数与误差。'}
        </p>
      </div>
      <figcaption>
        简化模型：R = 1 kΩ、C = 0.5 nF 的 RC 低通，输入 ½[tanh((t − 1 µs)/30 ns) − tanh((t − 5
        µs)/30 ns)] V，不设断点；电路是线性的，每步一次即收敛，不会触发 NR 失败缩步。按上文
        DCtran、CKTtrunc 与 CKTterr 的规则计算 .tran 0.2u 10u（TMAX = 0.2
        µs），abstol、chgtol、trtol 取 ngspice 缺省值；精确解由卷积数值积分得到。
      </figcaption>
    </>
  );
}
