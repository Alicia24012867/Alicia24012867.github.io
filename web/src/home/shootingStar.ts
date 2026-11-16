export type StarFlight = {
  /** Where the head starts, in pixels from the sky's top left corner. */
  x: number;
  y: number;
  /** Degrees below the horizon. Stars travel left, across the sky the girl looks into. */
  angle: number;
  distance: number;
  /** Tail length in pixels. */
  length: number;
  duration: number;
};

/**
 * A streak across the upper sky, or one starting from a tapped point. The illustrated
 * face sits near 66% of the width at every size, so a whole streak, tail included,
 * starts left of 60% and flies further left.
 */
export function starFlight(
  width: number,
  height: number,
  random = Math.random,
  from?: { x: number; y: number },
): StarFlight {
  const length = Math.min(90 + random() * 70, width * 0.22);
  return {
    x: from?.x ?? width * 0.2 + random() * Math.max(0, width * 0.4 - length),
    y: from?.y ?? height * (0.03 + random() * 0.25),
    angle: 15 + random() * 17,
    distance: Math.min(width * 0.55, 180 + random() * 160),
    length,
    duration: 900 + random() * 500,
  };
}

/** The head leads with its tail behind it, brightening and stretching, then fading out. */
export function starKeyframes({ x, y, angle, distance }: StarFlight): Keyframe[] {
  const radians = (angle * Math.PI) / 180;
  const dx = -Math.cos(radians) * distance;
  const dy = Math.sin(radians) * distance;
  const at = (progress: number, stretch: number) =>
    `translate(${x + dx * progress}px, ${y + dy * progress}px) rotate(${-angle}deg) scaleX(${stretch})`;
  return [
    { transform: at(0, 0.4), opacity: 0 },
    { transform: at(0.2, 1), opacity: 1, offset: 0.2 },
    { transform: at(1, 0.7), opacity: 0 },
  ];
}
