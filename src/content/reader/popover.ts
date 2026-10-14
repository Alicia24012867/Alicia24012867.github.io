type Box = { left: number; top: number; bottom: number; width: number };
type Size = { width: number; height: number };

/**
 * Where a reader popover goes, in viewport coordinates: below its link when it fits,
 * otherwise above when there is more room there (never under the header), and always
 * inside the screen edges. `caret` is the link's centre within the popover.
 */
export function popoverPlacement(
  reference: Box,
  preview: Size,
  viewport: Size,
  { header = 0, gap = 10, margin = 16 } = {},
) {
  const centre = reference.left + reference.width / 2;
  const widest = viewport.width - margin * 2;
  const left = Math.max(
    margin,
    Math.min(centre - preview.width / 2, margin + widest - preview.width),
  );
  const below = viewport.height - margin - (reference.bottom + gap);
  const above = reference.top - gap - Math.max(header, 0) - margin;
  const isAbove = preview.height > below && above > below;
  const top = isAbove ? reference.top - gap - preview.height : reference.bottom + gap;
  // Keep the caret off the rounded corners.
  const caret = Math.max(14, Math.min(centre - left, preview.width - 14));
  return { left, top, above: isAbove, caret };
}

type Point = { x: number; y: number };

/** The line box of a wrapped link closest to the pointer; the first line without one. */
export function nearestBox<T extends Omit<Box, 'width'> & { right: number }>(
  boxes: readonly T[],
  point?: Point,
) {
  if (!point) return boxes[0];
  const distance = (box: T) =>
    Math.max(box.left - point.x, 0, point.x - box.right) ** 2 +
    Math.max(box.top - point.y, 0, point.y - box.bottom) ** 2;
  return boxes.reduce((best, box) => (distance(box) < distance(best) ? box : best), boxes[0]);
}
