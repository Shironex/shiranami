import { cpSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = join(__dirname, '../../web/dist');
const dest = join(__dirname, '../dist/renderer');

if (!existsSync(source)) {
  console.error('Web build not found at:', source);
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
cpSync(source, dest, { recursive: true });
console.log('Renderer files copied to:', dest);
