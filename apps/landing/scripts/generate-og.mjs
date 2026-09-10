import sharp from 'sharp';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const WIDTH = 1200;
const HEIGHT = 630;

const BG = { r: 14, g: 12, b: 28, alpha: 255 };

// Load and resize mascot larger
const mascotPath = resolve(root, 'src/assets/mascot.png');
const mascot = await sharp(mascotPath)
  .resize(280, 280, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toBuffer();

// Larger, softer glow behind mascot
const glowA = await sharp(
  Buffer.from(`<svg width="500" height="500" xmlns="http://www.w3.org/2000/svg">
    <circle cx="250" cy="250" r="250" fill="rgba(130,90,210,0.18)"/>
  </svg>`)
)
  .blur(90)
  .toBuffer();

// Second subtle glow top-right
const glowB = await sharp(
  Buffer.from(`<svg width="350" height="350" xmlns="http://www.w3.org/2000/svg">
    <circle cx="175" cy="175" r="175" fill="rgba(100,60,180,0.12)"/>
  </svg>`)
)
  .blur(70)
  .toBuffer();

// Accent line under tagline
const accentLine = Buffer.from(`<svg width="60" height="3" xmlns="http://www.w3.org/2000/svg">
  <rect width="60" height="3" rx="1.5" fill="#a78bfa"/>
</svg>`);

// All text as SVG
const textSvg = Buffer.from(`
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <text x="90" y="190" font-family="system-ui, sans-serif" font-size="20" fill="#a78bfa" opacity="0.7">白波</text>
  <text x="90" y="270" font-family="system-ui, sans-serif" font-size="80" font-weight="800" fill="#f0ecf8" letter-spacing="-2">Shiranami</text>
  <text x="90" y="325" font-family="system-ui, sans-serif" font-size="21" fill="#9090a8">Your personal music sanctuary.</text>
  <text x="90" y="405" font-family="system-ui, sans-serif" font-size="14" fill="#6a6a80" letter-spacing="0.5">Local library · Synced lyrics · Playlists · One-step downloads</text>
</svg>`);

await sharp({
  create: { width: WIDTH, height: HEIGHT, channels: 4, background: BG },
})
  .composite([
    { input: glowA, top: 80, left: 680, blend: 'screen' },
    { input: glowB, top: -30, left: 850, blend: 'screen' },
    { input: textSvg, top: 0, left: 0 },
    { input: accentLine, top: 345, left: 90 },
    { input: mascot, top: 170, left: 840 },
  ])
  .png()
  .toFile(resolve(root, 'public/og-default.png'));

console.log('Generated public/og-default.png (1200x630)');
