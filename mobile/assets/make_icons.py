"""Regenerate the app's PNG assets from the Ferman wordmark.

Run:  python mobile/assets/make_icons.py

Kept in the repo so the icons can be rebuilt (different colour, tighter type,
another font) without redoing the work by hand. Drawn directly with Pillow
rather than rasterising an SVG, because there is no SVG rasteriser on this
machine and the artwork is just a rounded field plus two lines of type.

What Expo expects, and why each file differs:

  icon.png          full-bleed square, no transparency. iOS applies its own
                    rounded mask, so rounding it here would show corner seams.
  adaptive-icon.png the Android *foreground layer* only — transparent, with the
                    green coming from `android.adaptiveIcon.backgroundColor` in
                    app.json. Android crops to a circle, so the type is kept
                    inside the middle ~60%. app.json also uses this file as the
                    splash image, where it lands as white type on the same green.
  favicon.png       small, square, green baked in (browsers don't mask it).

There is deliberately no splash.png: app.json's splash screen renders
adaptive-icon.png on the same green, so a separate file would only ever go
stale unnoticed.
"""
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))

EMERALD = (5, 150, 105, 255)      # #059669 — matches themes.ts and app.json
WHITE = (255, 255, 255, 255)
LINES = ("Fer", "man")

# Segoe UI Bold carries a proper ê; swap this for Inter/Poppins/Manrope Bold if
# you install one — the layout below adapts to whatever the font measures.
FONT_CANDIDATES = [
    "C:/Windows/Fonts/segoeuib.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def pick_font_path():
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return p
    raise SystemExit("No usable bold font found — add one to FONT_CANDIDATES.")


FONT_PATH = pick_font_path()
LINE_GAP = 0.06          # gap between the two lines, as a fraction of the canvas


def fit_font(size_px, target_w):
    """Largest font size whose widest line fits `target_w`."""
    lo, hi, best = 8, size_px, 8
    while lo <= hi:
        mid = (lo + hi) // 2
        f = ImageFont.truetype(FONT_PATH, mid)
        w = max(f.getbbox(l)[2] - f.getbbox(l)[0] for l in LINES)
        if w <= target_w:
            best, lo = mid, mid + 1
        else:
            hi = mid - 1
    return ImageFont.truetype(FONT_PATH, best)


def draw_wordmark(size, content_frac, background=None):
    """Two centred lines. `content_frac` is how much of the canvas width the
    wider line may occupy — smaller values leave room for Android's crop."""
    img = Image.new("RGBA", (size, size), background or (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    font = fit_font(size, int(size * content_frac))

    # Measure each line by its ink, not its advance width, so the block is
    # optically centred rather than centred on the font's own padding.
    boxes = [font.getbbox(l) for l in LINES]
    heights = [b[3] - b[1] for b in boxes]
    gap = int(size * LINE_GAP)
    total_h = sum(heights) + gap

    y = (size - total_h) / 2
    for line, box, h in zip(LINES, boxes, heights):
        w = box[2] - box[0]
        d.text((size / 2 - w / 2 - box[0], y - box[1]), line, font=font, fill=WHITE)
        y += h + gap
    return img


def main():
    # iOS / general launcher icon: green baked in, square, fully opaque.
    icon = draw_wordmark(1024, 0.42, background=EMERALD)
    icon.convert("RGB").save(os.path.join(HERE, "icon.png"))

    # Android foreground + splash artwork: transparent, type kept well inside the
    # circular crop.
    draw_wordmark(1024, 0.34).save(os.path.join(HERE, "adaptive-icon.png"))

    # Browser tab.
    draw_wordmark(196, 0.44, background=EMERALD).convert("RGB").save(
        os.path.join(HERE, "favicon.png")
    )

    print(f"font: {FONT_PATH}")
    for name in ("icon.png", "adaptive-icon.png", "favicon.png"):
        p = os.path.join(HERE, name)
        with Image.open(p) as im:
            print(f"  {name:20} {im.size[0]}x{im.size[1]} {im.mode}")


if __name__ == "__main__":
    main()
