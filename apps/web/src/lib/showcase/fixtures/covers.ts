/**
 * Procedural cover art: small SVGs built from a palette and a motif, served as
 * `data:` URLs so showcase mode needs no image files and no network.
 */

import { seededRandom } from '../determinism';

export type CoverMotif = 'moon' | 'rings' | 'waves' | 'peaks' | 'grid' | 'stripes' | 'orbit';

export interface CoverSpec {
  /** Background gradient, top left to bottom right. */
  from: string;
  to: string;
  /** Motif color. */
  accent: string;
  motif: CoverMotif;
  seed: number;
}

function motifMarkup(spec: CoverSpec): string {
  const random = seededRandom(spec.seed);
  const a = spec.accent;
  switch (spec.motif) {
    case 'moon': {
      const cx = 90 + random() * 80;
      const cy = 70 + random() * 40;
      return (
        `<circle cx="${cx}" cy="${cy}" r="44" fill="${a}" opacity="0.92"/>` +
        `<circle cx="${cx + 18}" cy="${cy - 10}" r="40" fill="${spec.from}" opacity="0.55"/>` +
        `<path d="M0 190 Q64 168 128 186 T256 180 V256 H0Z" fill="${spec.to}" opacity="0.85"/>` +
        `<path d="M0 214 Q72 196 140 212 T256 206 V256 H0Z" fill="#000" opacity="0.25"/>`
      );
    }
    case 'rings': {
      let out = '';
      const cx = 128 + (random() - 0.5) * 40;
      const cy = 128 + (random() - 0.5) * 40;
      for (let r = 18; r < 170; r += 16) {
        out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${a}" stroke-width="3" opacity="${(1 - r / 190).toFixed(2)}"/>`;
      }
      return out;
    }
    case 'waves': {
      let out = '';
      for (let i = 0; i < 7; i += 1) {
        const y = 60 + i * 28;
        const amp = 10 + random() * 14;
        out += `<path d="M-10 ${y} Q40 ${y - amp} 90 ${y} T190 ${y} T290 ${y}" fill="none" stroke="${a}" stroke-width="4" stroke-linecap="round" opacity="${(0.35 + i * 0.09).toFixed(2)}"/>`;
      }
      return out;
    }
    case 'peaks': {
      const h1 = 90 + random() * 40;
      const h2 = 120 + random() * 40;
      return (
        `<circle cx="${60 + random() * 140}" cy="64" r="22" fill="${a}" opacity="0.9"/>` +
        `<path d="M0 256 L70 ${h1} L130 200 L190 ${h2 - 30} L256 210 V256Z" fill="${a}" opacity="0.45"/>` +
        `<path d="M0 256 L50 210 L110 ${h2} L180 230 L256 180 V256Z" fill="#000" opacity="0.35"/>`
      );
    }
    case 'grid': {
      let out = '';
      for (let x = 0; x < 8; x += 1) {
        for (let y = 0; y < 8; y += 1) {
          const r = 3 + random() * 9;
          out += `<circle cx="${24 + x * 30}" cy="${24 + y * 30}" r="${r.toFixed(1)}" fill="${a}" opacity="${(0.25 + random() * 0.7).toFixed(2)}"/>`;
        }
      }
      return out;
    }
    case 'stripes': {
      let out = '';
      for (let i = -4; i < 12; i += 1) {
        const w = 6 + random() * 14;
        out += `<rect x="${i * 30}" y="-60" width="${w.toFixed(1)}" height="400" fill="${a}" opacity="${(0.2 + random() * 0.6).toFixed(2)}" transform="rotate(28 128 128)"/>`;
      }
      return out;
    }
    case 'orbit': {
      const r = 30 + random() * 12;
      return (
        `<ellipse cx="128" cy="140" rx="104" ry="34" fill="none" stroke="${a}" stroke-width="3" opacity="0.7" transform="rotate(-18 128 140)"/>` +
        `<circle cx="128" cy="132" r="${r.toFixed(1)}" fill="${a}"/>` +
        `<circle cx="${40 + random() * 40}" cy="${70 + random() * 30}" r="7" fill="${a}" opacity="0.8"/>` +
        `<circle cx="${190 + random() * 30}" cy="${190 + random() * 20}" r="4" fill="${a}" opacity="0.6"/>`
      );
    }
  }
}

/** An album or playlist cover as a `data:image/svg+xml` URL. */
export function coverDataUrl(spec: CoverSpec): string {
  const id = `g${spec.seed}`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">` +
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${spec.from}"/><stop offset="1" stop-color="${spec.to}"/>` +
    `</linearGradient></defs>` +
    `<rect width="256" height="256" fill="url(#${id})"/>` +
    motifMarkup(spec) +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** A small round-ish station logo: initials on a colored tile. */
export function stationLogoDataUrl(label: string, from: string, to: string): string {
  const initials = label
    .split(/\s+/)
    .map(word => word[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">` +
    `<defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
    `</linearGradient></defs>` +
    `<rect width="96" height="96" rx="20" fill="url(#s)"/>` +
    `<text x="48" y="60" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="#fff">${initials}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
