#!/usr/bin/env node
/**
 * Renders the launcher shortcut icons (long press on the app icon) from
 * lucide shapes: a lavender glyph on the app's dark background, 432px for the
 * 108dp adaptive canvas, glyph inside the 66dp safe zone.
 *
 * Needs `sharp`, which the landing app already pulls in. Run from apps/mobile:
 *     node scripts/make-shortcut-icons.mjs
 * Colors come from theme/colors.json (run `pnpm tokens` after a palette change).
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.resolve('../landing/package.json'));
const sharp = require('sharp');

const LUCIDE = path.resolve('node_modules/lucide-react-native/dist/esm/icons');
const OUT = path.resolve('assets/images/shortcuts');
const colors = JSON.parse(readFileSync('theme/colors.json', 'utf8')).colors;

const CANVAS = 432;
// 66dp safe zone of 108dp, so the 24 unit glyph is drawn 40dp wide.
const GLYPH = Math.round(CANVAS * (40 / 108));
const ICONS = ['play', 'radio', 'shuffle'];

async function iconNodes(name) {
  const source = readFileSync(path.join(LUCIDE, `${name}.mjs`), 'utf8');
  const data = source.match(/const __iconData = (\{[\s\S]*?\n\});/)[1];
  return new Function(`return (${data})`)().node;
}

function toSvgElement([tag, attrs]) {
  const { key: _key, ...rest } = attrs;
  const props = Object.entries(rest)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  return `<${tag} ${props}/>`;
}

mkdirSync(OUT, { recursive: true });
for (const name of ICONS) {
  const body = (await iconNodes(name)).map(toSvgElement).join('');
  const offset = (CANVAS - GLYPH) / 2;
  const scale = GLYPH / 24;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}">` +
    `<g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" ` +
    `stroke="${colors.primary}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `${body}</g></svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  writeFileSync(path.join(OUT, `shortcut-${name}.png`), png);
}
