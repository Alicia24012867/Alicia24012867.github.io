import test from 'node:test';
import assert from 'node:assert/strict';
import { compileArticle } from '../scripts/content/compile.mjs';
import {
  advance,
  circuit,
  exactCurve,
  simulate,
  source,
  tmax,
} from '../src/content/figures/timestep.ts';

const runs = [];
for (const reltol of [1e-2, 1e-3, 1e-4, 1e-5, 1e-6])
  for (const compensate of [false, true])
    runs.push({ reltol, compensate, run: simulate(reltol, compensate) });

test('articles place known interactive figures with empty placeholders', () => {
  const article = compileArticle(
    'Text\n\n<figure data-figure="timestep-control"></figure>\n\nMore',
    'figure.md',
  );
  assert.match(article.html, /<figure data-figure="timestep-control"><\/figure>/);
  assert.throws(
    () => compileArticle('<figure data-figure="nope"></figure>', 'figure.md'),
    /未知的交互图 nope/,
  );
  assert.throws(
    () => compileArticle('<figure data-figure="timestep-control"><p>old</p></figure>', 'figure.md'),
    /请勿填写内容/,
  );
  // Ordinary figures are untouched.
  assert.match(
    compileArticle('<figure><p>x</p></figure>', 'plain.md').html,
    /<figure><p>x<\/p><\/figure>/,
  );
});

test('the run starts like DCtran: a tiny backward Euler step taken twice, then trapezoidal', () => {
  const [{ run }] = runs.filter((entry) => entry.reltol === 1e-3 && !entry.compensate);
  const [, first, second, third] = run.steps;
  // MIN(tstop/100, tstep)/10, then /10 again for the first time point.
  assert.equal(first.h, Math.min(circuit.tstop / 100, circuit.tstep) / 100);
  // The first point is accepted unchecked and keeps its step.
  assert.equal(second.h, first.h);
  assert.deepEqual([first.order, second.order, third.order], [1, 1, 2]);
  assert.ok(run.steps.slice(3).every((step) => step.order === 2));
});

test('steps stay under TMAX, at most double, and the last one lands on tstop', () => {
  for (const { reltol, compensate, run } of runs) {
    const label = `${reltol} ${compensate}`;
    for (let n = 2; n < run.steps.length; n++) {
      const { t, h } = run.steps[n];
      assert.ok(h <= tmax * (1 + 1e-12), label);
      assert.ok(h <= 2 * run.steps[n - 1].h * (1 + 1e-12), label);
      assert.ok(Math.abs(t - h - run.steps[n - 1].t) <= 1e-18, label);
    }
    assert.ok(Math.abs(run.steps.at(-1).t - circuit.tstop) <= 1e-18, label);
  }
});

test('a rejected step is retried from the same point with under 0.9 of its length', () => {
  let checked = 0;
  for (const { run } of runs) {
    const starts = new Map(run.steps.slice(1).map((step) => [step.t - step.h, step]));
    const tries = new Map();
    for (const attempt of run.rejected) {
      const start = attempt.t - attempt.h;
      const key = [...starts.keys()].find((t) => Math.abs(t - start) <= 1e-18);
      assert.ok(key !== undefined, 'every rejection starts from an accepted point');
      tries.set(key, [...(tries.get(key) ?? []), attempt.h]);
    }
    for (const [start, lengths] of tries) {
      const attempts = [...lengths, starts.get(start).h].sort((a, b) => b - a);
      for (let i = 1; i < attempts.length; i++) assert.ok(attempts[i] <= 0.9 * attempts[i - 1]);
      checked++;
    }
  }
  assert.ok(checked > 50);
});

test("ngspice's default tolerance walks over the edges at TMAX; the factorial changes that", () => {
  const plain = runs.find((entry) => entry.reltol === 1e-3 && !entry.compensate).run;
  const compensated = runs.find((entry) => entry.reltol === 1e-3 && entry.compensate).run;
  assert.equal(plain.rejected.length, 0);
  // After the doubling ramp every step is TMAX, until the last two share what is left.
  const ramp = plain.steps.findIndex((step) => step.h === tmax);
  const [before, last] = plain.steps.slice(-2);
  assert.ok(plain.steps.slice(ramp, -2).every((step) => step.h === tmax));
  assert.ok(Math.abs(before.h - last.h) < 1e-18 && before.h < tmax);
  assert.ok(compensated.rejected.length > 0);
  assert.ok(compensated.steps.length > plain.steps.length);
  assert.ok(compensated.maxError < plain.maxError);
});

test('a tighter reltol takes more steps and lowers the error', () => {
  for (const compensate of [false, true]) {
    const series = runs.filter((entry) => entry.compensate === compensate && entry.reltol <= 1e-3);
    for (let i = 1; i < series.length; i++) {
      assert.ok(series[i].run.steps.length > series[i - 1].run.steps.length);
      assert.ok(series[i].run.maxError < series[i - 1].run.maxError);
    }
  }
});

test('the reference solves the RC equation exactly', () => {
  const tau = circuit.resistance * circuit.capacitance;
  const samples = exactCurve(20001);
  const dt = samples[1][0];
  let worst = 0;
  for (let i = 1; i < samples.length - 1; i++) {
    const slope = (samples[i + 1][1] - samples[i - 1][1]) / (2 * dt);
    worst = Math.max(worst, Math.abs(slope - (source(samples[i][0]) - samples[i][1]) / tau));
  }
  // Against a peak slope near 1/tau, the residual is the central difference's own error.
  assert.ok(worst * tau < 1e-4, String(worst * tau));
  // Splitting an interval anywhere gives the same answer.
  const whole = advance(0, 0, 3e-6);
  const split = advance(advance(0, 0, 1.0123e-6), 1.0123e-6, 3e-6);
  assert.ok(Math.abs(whole - split) < 1e-13);
  // Between the edges the response is closed-form: the tanh edge is a logistic spread of
  // a step, whose moment generating function gives the delay factor exactly.
  const t = circuit.fall - 10 * circuit.edge;
  const spread = (Math.PI * circuit.edge) / (2 * tau);
  const expected = 1 - Math.exp(-(t - circuit.rise) / tau) * (spread / Math.sin(spread));
  assert.ok(Math.abs(advance(0, 0, t) - expected) < 1e-8);
});
