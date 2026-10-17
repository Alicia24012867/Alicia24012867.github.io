/** The symbols TeX commands draw, for the commands plain text can show. */
export const symbols: Record<string, string> = {
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  ne: '≠',
  neq: '≠',
  approx: '≈',
  equiv: '≡',
  sim: '~',
  times: '×',
  cdot: '·',
  div: '÷',
  pm: '±',
  in: '∈',
  notin: '∉',
  infty: '∞',
  to: '→',
  rightarrow: '→',
  leftarrow: '←',
  ldots: '…',
  cdots: '…',
  dots: '…',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
};
/** Commands that only space a formula out or set how its letters look. */
export const quiet = /^(quad|qquad|left|right|text|textrm|mathrm|mathit|mathbf|operatorname)$/;

// Unicode's small raised and lowered characters, for the scripts plain text can set.
const raised: Record<string, string> = Object.fromEntries(
  [...'0123456789+-=()abcdefghijklmnoprstuvwxyzABDEGHIJKLMNOPRTUVW'].map((char, i) => [
    char,
    [...'⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻᴬᴮᴰᴱᴳᴴᴵᴶᴷᴸᴹᴺᴼᴾᴿᵀᵁⱽᵂ'][i],
  ]),
);
const lowered: Record<string, string> = Object.fromEntries(
  [...'0123456789+-=()aehijklmnoprstuvx'].map((char, i) => [
    char,
    [...'₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ'][i],
  ]),
);
const greek = /\p{Script=Greek}/u;

/**
 * A formula as plain text: each command written as the symbol it draws and its scripts set
 * in Unicode's small raised and lowered characters, so `h_{n+1} \le 0.9 h_n^2` is written
 * "hₙ₊₁ ≤ 0.9 hₙ²". A formula with fractions, roots, sums or a script plain text has no
 * characters for has no such form.
 */
export function writtenTex(tex: string): string | undefined {
  let plain = true;
  const script = (group: string, table: Record<string, string>) => {
    const chars = [...group.replace(/^\{|\}$/g, '').replace(/\s+/g, '')];
    if (!chars.length || chars.some((char) => !(char in table))) plain = false;
    return chars.map((char) => table[char] ?? '').join('');
  };
  const written = tex
    .replace(/\\([a-zA-Z]+)/g, (_, name: string) => {
      if (quiet.test(name)) return ' ';
      const symbol = symbols[name];
      if (symbol === undefined) plain = false;
      // Letters join the letters beside them; relations and operators stand apart.
      return greek.test(symbol ?? '') ? symbol : ` ${symbol ?? ''} `;
    })
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/\\([%#&$])/g, '$1')
    .replace(/_(\{[^{}]*\}|[^\s{}])/g, (_, group: string) => script(group, lowered))
    .replace(/\^(\{[^{}]*\}|[^\s{}])/g, (_, group: string) => script(group, raised))
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain && written && !/[\\_^]/.test(written) ? written : undefined;
}
