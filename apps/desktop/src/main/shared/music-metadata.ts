// music-metadata is ESM-only and heavy, so it's loaded lazily once and the
// module promise result is shared by every consumer (metadata parsing,
// embedded lyrics).
let mmModule: typeof import('music-metadata') | null = null;

export async function getMusicMetadata(): Promise<typeof import('music-metadata')> {
  if (!mmModule) {
    mmModule = await import('music-metadata');
  }
  return mmModule;
}
