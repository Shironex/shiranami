import { logger } from '../app/logger';
import { getMusicMetadata } from '../shared/music-metadata';
import { parseLrc, type LyricLine, type LyricsResult } from './lyrics-parse';

export type EmbeddedLyricsResult = Omit<LyricsResult, 'source'> & {
  source: 'embedded';
};

// Minimal local shape for a lyrics tag entry. music-metadata's runtime shape
// varies by format/version, so we only type what we read and treat fields as
// optional.
interface SyncTextEntry {
  timestamp?: number;
  text?: string;
}

interface LyricsTagEntry {
  syncText?: SyncTextEntry[];
  text?: string;
  descriptor?: string;
  language?: string;
}

const LRC_TIMESTAMP_RE = /\[\d{1,2}:\d{2}[.:]/;

function looksLikeLrc(text: string): boolean {
  return LRC_TIMESTAMP_RE.test(text);
}

/**
 * Read lyrics embedded in an audio file's metadata tags (ID3 USLT/SYLT,
 * Vorbis LYRICS, MP4 ©lyr). Returns null when the file has no embedded
 * lyrics or when parsing fails.
 */
export async function readEmbeddedLyrics(
  audioFilePath: string
): Promise<EmbeddedLyricsResult | null> {
  const mm = await getMusicMetadata();

  let metadata: Awaited<ReturnType<typeof mm.parseFile>>;
  try {
    metadata = await mm.parseFile(audioFilePath, { skipCovers: true, duration: false });
  } catch (error) {
    logger.warn(`[embedded-lyrics] Failed to parse file: ${audioFilePath}`, error);
    return null;
  }

  const raw = (metadata.common as { lyrics?: unknown }).lyrics;
  if (!Array.isArray(raw) || raw.length === 0) {
    logger.debug(`[embedded-lyrics] No lyrics tag in: ${audioFilePath}`);
    return null;
  }

  const entries = raw as LyricsTagEntry[];

  // Prefer an entry with a non-empty syncText array (SYLT frames).
  const syncEntry = entries.find(e => Array.isArray(e?.syncText) && e.syncText.length > 0);

  if (syncEntry?.syncText) {
    const lines: LyricLine[] = [];
    for (const s of syncEntry.syncText) {
      if (typeof s?.timestamp === 'number' && typeof s?.text === 'string') {
        lines.push({ time: s.timestamp / 1000, text: s.text });
      }
    }
    if (lines.length > 0) {
      lines.sort((a, b) => a.time - b.time);
      return { synced: lines, plain: null, source: 'embedded' };
    }
  }

  // Otherwise, fall back to text entries (USLT / Vorbis LYRICS / ©lyr).
  // If multiple, pick the longest.
  const textEntry = entries
    .filter(e => typeof e?.text === 'string' && e.text.length > 0)
    .sort((a, b) => (b.text?.length ?? 0) - (a.text?.length ?? 0))[0];

  if (!textEntry?.text) {
    return null;
  }

  const text = textEntry.text;

  // Some taggers store raw LRC inside the unsynchronized-lyrics frame.
  if (looksLikeLrc(text)) {
    const lines = parseLrc(text);
    if (lines.length > 0) {
      return { synced: lines, plain: null, source: 'embedded' };
    }
  }

  return { synced: null, plain: text, source: 'embedded' };
}
