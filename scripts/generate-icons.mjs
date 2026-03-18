#!/usr/bin/env node

import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const resourcesDir = resolve(root, 'apps/desktop/resources');
const source = resolve(resourcesDir, 'mascot.png');

mkdirSync(resourcesDir, { recursive: true });

const sizes = [16, 32, 48, 64, 128, 256, 512, 1024];

async function generate() {
  console.log('Generating app icons from mascot.png...\n');

  // Generate sized PNGs
  for (const size of sizes) {
    const outPath = resolve(resourcesDir, size === 1024 ? 'icon.png' : `icon-${size}.png`);
    await sharp(source)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outPath);
    console.log(`  icon${size === 1024 ? '' : `-${size}`}.png  (${size}x${size})`);
  }

  // Generate ICO (Windows) from multiple sizes
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const icoPngs = await Promise.all(
    icoSizes.map(size =>
      sharp(source)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
    )
  );
  const icoBuffer = await pngToIco(icoPngs);
  const icoPath = resolve(resourcesDir, 'icon.ico');
  writeFileSync(icoPath, icoBuffer);
  console.log(`  icon.ico       (multi-res: ${icoSizes.join(', ')})`);

  console.log('\nDone!');
}

generate().catch(err => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
