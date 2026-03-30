import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Read --primary-rgb from CSS and return as [r, g, b] tuple. Cached per call site. */
let _primaryRGB: [number, number, number] | null = null;
export function getPrimaryRGB(): [number, number, number] {
  if (_primaryRGB) return _primaryRGB;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--primary-rgb').trim();
  const parts = raw.split(',').map(Number);
  if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
    _primaryRGB = parts as unknown as [number, number, number];
  } else {
    _primaryRGB = [155, 125, 235]; // fallback
  }
  return _primaryRGB;
}
