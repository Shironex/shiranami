import { logger } from './logger';
import { parseLrc, type LyricsResult, type LyricLine } from './lyrics-service';

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

// Cache the dynamic import — match pattern in metadata-service.ts
let mmModule: typeof import('music-metadata') | null = null;

async function getModule() {
  if (!mmModule) {
    mmModule = await import('music-metadata');
  }
  return mmModule;
}

const LRC_TIMESTAMP_RE = /\[\d{2}:\d{2}[.:]/;

function looksLikeLrc(text: string): boolean {
  return LRC_TIMESTAMP_RE.test(text);
}

/**
 * Read lyrics embedded in an audio file's metadata tags (ID3 USLT/SYLT, Vorbis
 * LYRICS, etc.). Returns null when the file has no embedded lyrics or when
 * parsing fails.
 */
export async function readEmbeddedLyrics(
  audioFilePath: string
): Promise<EmbeddedLyricsResult | null> {
  const mm = await getModule();

  let metadata: Awaited<ReturnType<typeof mm.parseFile>>;
  try {
    metadata = await mm.parseFile(audioFilePath, {
      skipCovers: true,
      duration: false,
    });
  } catch (error) {
    logger.warn(
      `[embedded-lyrics] Failed to parse file: ${audioFilePath}`,
      error
    );
    return null;
  }

  const raw = (metadata.common as { lyrics?: unknown }).lyrics;
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }

  const entries = raw as LyricsTagEntry[];

  // Precedence: prefer an entry with a non-empty syncText array.
  const syncEntry = entries.find(
    e => Array.isArray(e?.syncText) && e.syncText.length > 0
  );

  if (syncEntry && syncEntry.syncText) {
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

  // Otherwise, fall back to text entries. If multiple, pick the longest.
  const textEntries = entries
    .filter(e => typeof e?.text === 'string' && e.text.length > 0)
    .sort((a, b) => (b.text?.length ?? 0) - (a.text?.length ?? 0));

  const textEntry = textEntries[0];
  if (!textEntry || !textEntry.text) {
    return null;
  }

  const text = textEntry.text;

  if (looksLikeLrc(text)) {
    const lines = parseLrc(text);
    if (lines.length > 0) {
      return { synced: lines, plain: null, source: 'embedded' };
    }
    // Fell through — treat as plain
    return { synced: null, plain: text, source: 'embedded' };
  }

  return { synced: null, plain: text, source: 'embedded' };
}
