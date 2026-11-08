#!/usr/bin/env node
/* Writes theme/colors.json from theme/palette.js. Run with `pnpm tokens`. */
const fs = require('node:fs');
const path = require('node:path');
const { buildColors } = require('../theme/build-colors');

const out = path.join(__dirname, '..', 'theme', 'colors.json');
fs.writeFileSync(out, `${JSON.stringify(buildColors(), null, 2)}\n`);
console.log(`wrote ${path.relative(process.cwd(), out)}`);
