#!/usr/bin/env python3
"""Builds the launcher icons and the splash icon from the mascot.

Needs Pillow (`pip install pillow`). Run from apps/mobile:
    python3 scripts/make-app-icons.py <path to shiranami-icon-1024.png>
The source is the repo's assets/brand/shiranami-icon-1024.png. Colors come
from theme/colors.json, so run `pnpm tokens` first after a palette change.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageOps

SIZE = 1024
OUT = Path('assets/images')
COLORS = json.loads(Path('theme/colors.json').read_text())['colors']

# Bust crop in source pixels: a square from the headphones down to the
# hoodie pocket, centred on the face. Mapped onto the full 108dp canvas, the
# head sits inside the 66dp safe circle and the body runs off the bottom
# edge, so every launcher mask cuts the body, never the face.
CROP_CENTER_X = 505
CROP_TOP = -140
CROP_SIZE = 820


def hex_rgb(value):
    value = value.lstrip('#')
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def bust(source):
    left = CROP_CENTER_X - CROP_SIZE // 2
    box = (left, CROP_TOP, left + CROP_SIZE, CROP_TOP + CROP_SIZE)
    return source.crop(box).resize((SIZE, SIZE), Image.LANCZOS)


def flat(fg, color):
    canvas = Image.new('RGBA', (SIZE, SIZE), hex_rgb(color) + (255,))
    canvas.alpha_composite(fg)
    return canvas


def monochrome(fg):
    """Android 13 themed icon: only alpha counts. Keep the ink and the dark
    hair and hoodie, drop the pale skin and highlights, so the face reads as
    lines instead of a blob."""
    gray = ImageOps.grayscale(fg.convert('RGB'))
    ink = ImageOps.invert(gray).point(lambda v: 0 if v < 105 else min(255, (v - 105) * 4))
    alpha = ImageChops.multiply(ink, fg.getchannel('A'))
    white = Image.new('RGBA', (SIZE, SIZE), (255, 255, 255, 0))
    white.putalpha(alpha)
    return white


def splash(fg):
    """The bust inside a disk of the icon color. Android 12+ masks the splash
    icon to a circle; drawing the disk ourselves keeps it the same on every
    version."""
    disk = Image.new('L', (SIZE, SIZE), 0)
    inset = SIZE // 6  # the visible circle is two thirds of the canvas
    ImageDraw.Draw(disk).ellipse((inset, inset, SIZE - inset, SIZE - inset), fill=255)
    art = flat(fg, COLORS['icon'])
    art.putalpha(disk)
    return art


def main():
    source = Image.open(sys.argv[1]).convert('RGBA')
    fg = bust(source)
    fg.save(OUT / 'adaptive-icon.png', optimize=True)
    monochrome(fg).save(OUT / 'adaptive-icon-monochrome.png', optimize=True)
    flat(fg, COLORS['icon']).convert('RGB').save(OUT / 'icon.png', optimize=True)
    splash(fg).save(OUT / 'splash-icon.png', optimize=True)
    print('wrote adaptive-icon, adaptive-icon-monochrome, icon and splash-icon')


if __name__ == '__main__':
    main()
