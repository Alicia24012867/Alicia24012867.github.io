type StrokeTiming = {
  start: number;
  end: number;
  easing: readonly [number, number, number, number];
};

/** Preserve the matched pen speeds while bringing acceleration smoothly to zero
 * at each join. A cubic matches velocity but can jerk when the next mask begins. */
export function strokeKeyframes(
  { start, end, easing: [x1, y1, x2, y2] }: StrokeTiming,
  writtenAt: number,
  hold: number,
  duration: number,
): Keyframe[] {
  const enter = y1 / x1;
  const leave = (1 - y2) / (1 - x2);
  const samples = Math.max(12, Math.ceil((end - start) * 120));
  const progress = Array.from({ length: samples + 1 }, (_, index) => {
    const t = index / samples;
    // Quintic Hermite: position 0→1, specified endpoint velocities, zero
    // endpoint accelerations. The original glyphs and pen paths stay intact.
    return (
      enter * t +
      (10 - 6 * enter - 4 * leave) * t ** 3 +
      (-15 + 8 * enter + 7 * leave) * t ** 4 +
      (6 - 3 * enter - 3 * leave) * t ** 5
    );
  });
  progress[0] = 0;
  progress[samples] = 1;
  const mirror = writtenAt * 2 + hold;
  return [
    { strokeDashoffset: 1, visibility: 'hidden', offset: 0, easing: 'steps(1, end)' },
    ...progress.map((value, index) => ({
      strokeDashoffset: 1 - value,
      visibility: 'visible',
      offset: (start + ((end - start) * index) / samples) / duration,
    })),
    // Reuse the same samples in reverse, including pen-lift gaps; independently
    // easing the erase phase would no longer retrace precisely the same motion.
    ...[...progress].reverse().map((value, index) => ({
      strokeDashoffset: 1 - value,
      visibility: index === samples ? 'hidden' : 'visible',
      offset: (mirror - end + ((end - start) * index) / samples) / duration,
    })),
    { strokeDashoffset: 1, visibility: 'hidden', offset: 1 },
  ];
}
