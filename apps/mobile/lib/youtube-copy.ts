import { ApiError } from '@/lib/api';

/** What the Search tab says when YouTube search or saving fails. Plain English, no protocol words. */

/** Why a search could not run, as one line above the results. */
export function searchErrorLine(error: unknown): string {
  const kind = error instanceof ApiError ? error.kind : 'server';
  switch (kind) {
    case 'no_key':
      return 'This build has no server key, so YouTube search is off.';
    case 'unauthorized':
      return "The server didn't accept this app's key. Check the address in Settings, Advanced.";
    case 'unreachable':
      return "Can't reach the server. Check your connection and the address in Settings, Advanced.";
    case 'disabled':
      return "This server doesn't have YouTube search turned on.";
    case 'rate_limited':
      return 'Too many searches in a row. Wait a minute, then try again.';
    case 'unavailable':
    case 'server':
      return "The server couldn't get results from YouTube. Try again in a moment.";
  }
}

/** Why a song could not be played or saved, for the line under its row. */
export function trackErrorLine(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.kind) {
      case 'unavailable':
        return "This video can't be played";
      case 'unreachable':
        return "Can't reach the server";
      case 'rate_limited':
        return 'Too many at once, try again in a minute';
      case 'no_key':
      case 'unauthorized':
      case 'disabled':
        return searchErrorLine(error);
      case 'server':
        return "The server couldn't get this song";
    }
  }
  return "Couldn't save, try again";
}

/** "Saving 42%" for the row of a song that is downloading. */
export function savingLine(ratio: number): string {
  return `Saving ${Math.floor(Math.min(Math.max(ratio, 0), 1) * 100)}%`;
}
