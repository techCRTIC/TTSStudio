# CRTIC Logo

Scalable SVG logo assets for the CRTIC clean design system.

## Files

- **`crtic-mark.svg`** — the mark (five dots + barcode motif + ®). Use as icon,
  favicon, avatar, and in compact chrome (nav bars, headers).
- **`crtic-logo.svg`** — the full lockup (mark + "CRTIC" wordmark in Geist).
  Use as the primary brand signature.

Both use `fill="currentColor"` and default to CRTIC orange `#FA4515`.

## Color

- On snow (`#F5F5F7`/white): CRTIC orange `#FA4515` (default) or soft-black `#1D1D1F`.
- Recolor via CSS `color` on the `<svg>` (or the element wrapping an inline copy).
  Do not introduce a second hue, gradients, or effects.

## Clear space & minimum size

- Keep clear space around the logo of at least **one dot diameter** on all sides.
- Minimum mark height **20px** on screen (below that the barcode motif and ® blur).
  Use the mark, not the lockup, at small sizes.

## Do not

- Recolor to anything but the approved orange or soft-black.
- Stretch, rotate, add shadows/gradients, or place on a busy background without a
  solid panel behind it.
- Rebuild the wordmark in a font other than Geist.

## Note

These SVGs are a faithful geometric reconstruction from the supplied logo image
(vector, so they scale and recolor cleanly). If an official master SVG exists,
replace these files with it 1:1.
