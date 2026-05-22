import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Check if a track file path points to a radio stream. */
export function isRadioTrack(filePath: string): boolean {
  return filePath.startsWith('shiranami-radio://');
}
