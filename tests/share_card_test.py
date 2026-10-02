"""Renderer regressions; run with the Pillow environment used by share:cards."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "render_card", Path(__file__).resolve().parents[1] / "scripts/share/render_card.py"
)
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)


class FixedFont:
    def getlength(self, character):
        return 10


class ShareCardTests(unittest.TestCase):
    def test_bottom_fade_has_no_horizontal_seam(self):
        stops = [(1 - position, alpha) for position, alpha in renderer.VERTICAL_WASH]
        mask = renderer.vertical_gradient_mask(stops, 1, renderer.HEIGHT)
        values = [mask.getpixel((0, y)) for y in range(renderer.HEIGHT)]
        self.assertEqual(values[0], 0)
        self.assertEqual(values[-1], 204)
        self.assertTrue(all(0 <= b - a <= 2 for a, b in zip(values, values[1:])))

    def test_ellipsis_fits_inside_column_and_uses_the_original_font(self):
        font = FixedFont()
        line = [(character, font) for character in "long title"]
        clipped = renderer.ellipsize(line, 70, spacing=2)
        self.assertLessEqual(renderer.measure(clipped, spacing=2), 70)
        self.assertEqual(clipped[-1], ("…", font))

    def test_overlong_title_is_visibly_truncated(self):
        with patch.object(renderer, "font", return_value=FixedFont()):
            _, lines = renderer.fit_title("Long title " * 100, 300)
        self.assertEqual(len(lines), 3)
        self.assertEqual(lines[-1][-1][0], "…")
        self.assertTrue(all(renderer.measure(line) <= 300 for line in lines))


if __name__ == "__main__":
    unittest.main()
