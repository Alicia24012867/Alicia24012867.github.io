import test from 'node:test';
import assert from 'node:assert/strict';
import { writtenTex } from '../src/content/reader/tex.ts';

test('a simple formula is written as plain text, its scripts raised and lowered', () => {
  assert.equal(writtenTex('h_n = h_n/8'), 'hₙ = hₙ/8');
  assert.equal(writtenTex('h_n \\le 0.9 \\times h_n^p'), 'hₙ ≤ 0.9 × hₙᵖ');
  assert.equal(
    writtenTex('h_{n+1} = C \\alpha h_n, C \\in (0.8,0.9)'),
    'hₙ₊₁ = C α hₙ, C ∈ (0.8,0.9)',
  );
  assert.equal(writtenTex('O(h^3) / h = O(h^{2})'), 'O(h³) / h = O(h²)');
  assert.equal(writtenTex('10^{-3}'), '10⁻³');
  assert.equal(writtenTex('x_i^T'), 'xᵢᵀ');
  assert.equal(writtenTex('\\alpha_1 + \\beta'), 'α₁ + β');
  // Spacing commands and the commands that only style letters leave the letters.
  assert.equal(writtenTex('t = 5\\,\\text{ms}'), 't = 5 ms');
  assert.equal(writtenTex('\\left( a \\right)'), '( a )');
  assert.equal(writtenTex('50\\%'), '50%');
});

test('a formula plain text cannot show has no written form', () => {
  assert.equal(writtenTex('\\frac{a}{b}'), undefined);
  assert.equal(writtenTex('\\sqrt{2}'), undefined);
  // Not every letter has a small lowered or raised form.
  assert.equal(writtenTex('x_b'), undefined);
  assert.equal(writtenTex('e^{i\\pi}'), undefined);
  assert.equal(writtenTex('h_{n_{1}}'), undefined);
  assert.equal(writtenTex('x^{}'), undefined);
  assert.equal(writtenTex('{}'), undefined);
});
