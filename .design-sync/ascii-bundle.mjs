// Make the IIFE bundle charset-robust: escape every non-ASCII char to \uXXXX.
// esbuild leaves raw UTF-8 inside regex literals (a Japanese-detection range),
// so a host that serves _ds_bundle.js without a utf-8 charset reads those bytes
// as latin1 -> mojibake -> "Invalid regular expression" -> the IIFE throws ->
// window.<Global> is empty. \uXXXX is byte-for-byte ASCII and equivalent inside
// strings AND regex char-classes, so the bundle then loads no matter how it's
// served. Run AFTER package-build, BEFORE validate/upload.
import { readFileSync, writeFileSync } from 'node:fs';
const path = process.argv[2] || 'ds-bundle/_ds_bundle.js';
const src = readFileSync(path, 'utf8');
let escaped = 0;
let out = '';
for (let i = 0; i < src.length; i++) {
  const code = src.charCodeAt(i);
  if (code > 0x7f) {
    out += '\\u' + code.toString(16).padStart(4, '0');
    escaped++;
  } else {
    out += src[i];
  }
}
writeFileSync(path, out);
console.log(`ascii-bundle: escaped ${escaped} non-ASCII code unit(s) in ${path}`);
