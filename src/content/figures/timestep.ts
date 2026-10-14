/**
 * ngspice's transient step control (DCtran, CKTtrunc, CKTterr) on one small circuit: an RC
 * low-pass driven by a smooth pulse. The circuit is linear and the source sets no
 * breakpoints, so every step converges at once and only the truncation error moves it.
 */
export const circuit = {
  resistance: 1e3,
  capacitance: 0.5e-9,
  /** Source: ½[tanh((t − rise)/edge) − tanh((t − fall)/edge)] volts. */
  rise: 1e-6,
  fall: 5e-6,
  edge: 30e-9,
  /** `.tran 0.2u 10u` */
  tstep: 0.2e-6,
  tstop: 10e-6,
};

/** ngspice defaults (CKTnewTask) for the tolerances; TRAPEZOIDAL up to second order. */
export const defaults = { reltol: 1e-3, abstol: 1e-12, chgtol: 1e-14, trtol: 7 };

export type Order = 1 | 2;
/** An accepted time point, the step that reached it and the order that computed it. */
export type Step = { t: number; h: number; v: number; exact: number; order: Order };
/** A step the truncation error rejected: where it would have landed. */
export type Attempt = { t: number; h: number };
export type Run = { steps: Step[]; rejected: Attempt[]; maxError: number; worst: number };

const tau = circuit.resistance * circuit.capacitance;
const maxOrder = 2;
const trapCoeff = [0.5, 0.08333333333];
// The (order + 1)th divided difference is the derivative divided by (order + 1)!.
const factorial = [1, 1, 2, 6];
const maxStep = Math.min(circuit.tstep, circuit.tstop / 50);
const delmin = 1e-11 * maxStep;
// XSPICE builds (the default) drop breakpoints closer than this.
const minBreak = 10 * delmin;

export const tmax = maxStep;

export function source(t: number) {
  const { rise, fall, edge } = circuit;
  return 0.5 * (Math.tanh((t - rise) / edge) - Math.tanh((t - fall) / edge));
}

// AlmostEqualUlps(a, b, 100)
const nearlyEqual = (a: number, b: number) =>
  Math.abs(a - b) <= 100 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b));

/**
 * Steps from 0 to `tstop` the way DCtran does. With `compensate`, CKTterr multiplies the
 * divided difference by (order + 1)! so that it estimates the derivative itself.
 */
export function simulate(reltol: number, compensate = false): Run {
  const { resistance, capacitance, tstep, tstop } = circuit;
  const { abstol, chgtol, trtol } = defaults;
  // DC operating point: the capacitor is open and charged to the source.
  const v0 = source(0);
  // CKTstates[i]: [charge, current] i points back. CKTdeltaOld[i]: the step that ended there.
  const states: [number, number][] = Array.from({ length: maxOrder + 2 }, () => [
    capacitance * v0,
    0,
  ]);
  const deltaOld = Array<number>(7).fill(maxStep);
  const breaks = [0, tstop];
  let time = 0;
  let order: Order = 1;
  let delta = Math.min(tstop / 100, tstep) / 10;
  let saveDelta = tstop / 50;
  let firstTime = true;
  const steps: Step[] = [{ t: 0, h: 0, v: v0, exact: v0, order: 1 }];
  const rejected: Attempt[] = [];

  // NIiter on the linear circuit: backward Euler (order 1) or trapezoidal companion model.
  const solve = () => {
    const [q1, i1] = states[1];
    const vs = source(time);
    const v =
      order === 1
        ? (delta * vs + tau * (q1 / capacitance)) / (delta + tau)
        : (vs / resistance + i1 + (2 * q1) / delta) / (1 / resistance + (2 * capacitance) / delta);
    const q = capacitance * v;
    states[0] = [q, order === 1 ? (q - q1) / delta : (2 / delta) * (q - q1) - i1];
    return v;
  };

  // CKTtrunc → CAPtrunc → CKTterr for the one capacitor.
  const trunc = (timeStep: number) => {
    const [[q0, i0], [q1, i1]] = states;
    const currentTol = abstol + reltol * Math.max(Math.abs(i0), Math.abs(i1));
    const chargeTol = (reltol * Math.max(Math.abs(q0), Math.abs(q1), chgtol)) / delta;
    const tol = Math.max(currentTol, chargeTol);
    const diff = states.slice(0, order + 2).map(([q]) => q);
    const span = deltaOld.slice(0, order + 1);
    for (let j = order; ; ) {
      for (let i = 0; i <= j; i++) diff[i] = (diff[i] - diff[i + 1]) / span[i];
      if (--j < 0) break;
      for (let i = 0; i <= j; i++) span[i] = span[i + 1] + deltaOld[i];
    }
    const factor = trapCoeff[order - 1] * (compensate ? factorial[order + 1] : 1);
    let del = (trtol * tol) / Math.max(abstol, factor * Math.abs(diff[0]));
    if (order === 2) del = Math.sqrt(del);
    return Math.min(2 * timeStep, del);
  };

  for (;;) {
    // nextTime: the point at `time` is accepted.
    if (time > breaks[0]) breaks.shift();
    if (nearlyEqual(time, tstop)) break;
    // resume: limit the step, then meet the next breakpoint.
    delta = Math.min(delta, maxStep);
    if (nearlyEqual(time, breaks[0]) || breaks[0] - time <= delmin) {
      order = 1;
      delta = Math.min(delta, 0.1 * Math.min(saveDelta, breaks[1] - breaks[0]));
      if (firstTime) delta /= 10;
    }
    while ((breaks[0] <= time + minBreak || nearlyEqual(breaks[0], time)) && breaks[0] < tstop)
      breaks.shift();
    if (time + delta > breaks[0]) {
      saveDelta = delta;
      delta = breaks[0] - time;
    } else if (!nearlyEqual(time + delta, tstop) && time + 1.9 * delta > breaks[0]) {
      saveDelta = delta;
      delta = (breaks[0] - time) / 2;
    }
    deltaOld.unshift(delta);
    deltaOld.length = 7;
    states.unshift(states.pop()!);

    // Retry the step until its truncation error is accepted.
    for (;;) {
      time += delta;
      deltaOld[0] = delta;
      const v = solve();
      const used = order;
      if (firstTime) {
        // No check on the first time point; the older states start from the DC solution.
        states[2] = [...states[1]];
        states[3] = [...states[1]];
        firstTime = false;
        steps.push({ t: time, h: delta, v, exact: 0, order: used });
        break;
      }
      let newDelta = trunc(delta);
      if (newDelta > 0.9 * delta) {
        // Raise backward Euler to trapezoidal when that allows a clearly longer step.
        if (order === 1) {
          order = 2;
          newDelta = trunc(delta);
          if (newDelta <= 1.05 * delta) order = 1;
        }
        steps.push({ t: time, h: delta, v, exact: 0, order: used });
        delta = newDelta;
        break;
      }
      rejected.push({ t: time, h: delta });
      time -= delta;
      delta = newDelta;
      if (delta <= delmin) throw new Error('Timestep too small');
    }
  }

  let maxError = 0;
  let worst = 0;
  for (let n = 1; n < steps.length; n++) {
    steps[n].exact = advance(steps[n - 1].exact, steps[n - 1].t, steps[n].t);
    const error = Math.abs(steps[n].v - steps[n].exact);
    if (error > maxError) [maxError, worst] = [error, n];
  }
  return { steps, rejected, maxError, worst };
}

// 5-point Gauss–Legendre nodes and weights on [−1, 1].
const nodes = [-0.906179845938664, -0.5384693101056831, 0, 0.5384693101056831, 0.906179845938664];
const weights = [
  0.2369268850561891, 0.4786286704993665, 0.5688888888888889, 0.4786286704993665,
  0.2369268850561891,
];

/** The exact capacitor voltage at `b` from its value at `a`: the source convolved with the RC response. */
export function advance(v: number, a: number, b: number) {
  // Pieces a quarter of the edge width keep the quadrature exact to rounding.
  const pieces = Math.max(1, Math.ceil((b - a) / (circuit.edge / 4)));
  const width = (b - a) / pieces;
  let integral = 0;
  for (let piece = 0; piece < pieces; piece++) {
    const middle = a + (piece + 0.5) * width;
    for (let k = 0; k < 5; k++) {
      const s = middle + (nodes[k] * width) / 2;
      integral += weights[k] * Math.exp((s - b) / tau) * source(s);
    }
  }
  return v * Math.exp((a - b) / tau) + (integral * width) / 2 / tau;
}

/** `count` evenly spaced samples of the exact response from 0 to `tstop`. */
export function exactCurve(count: number) {
  const samples: [number, number][] = [[0, source(0)]];
  for (let i = 1; i < count; i++) {
    const [t, v] = samples[i - 1];
    const next = (i / (count - 1)) * circuit.tstop;
    samples.push([next, advance(v, t, next)]);
  }
  return samples;
}
