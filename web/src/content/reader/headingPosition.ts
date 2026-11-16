export interface HeadingPosition {
  id: string;
  top: number;
}

/** Last heading at or above the reading threshold, or the first heading before it. */
export function headingAt(positions: readonly HeadingPosition[], threshold: number) {
  let low = 0;
  let high = positions.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (positions[middle].top <= threshold) low = middle + 1;
    else high = middle;
  }
  return positions[Math.max(0, low - 1)]?.id ?? '';
}
