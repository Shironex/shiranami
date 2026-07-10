// music-metadata is ESM-only and heavy, so it's loaded lazily once and the
// import promise is shared by every consumer (metadata parsing, embedded
// lyrics), which also avoids redundant imports on concurrent first calls.
let mmPromise: Promise<typeof import('music-metadata')> | null = null;

export function getMusicMetadata(): Promise<typeof import('music-metadata')> {
  if (!mmPromise) {
    mmPromise = import('music-metadata');
  }
  return mmPromise;
}
