import { requireOptionalNativeModule } from 'expo';

/** The audio permission as Expo reports it (READ_MEDIA_AUDIO, or storage before Android 13). */
export interface AudioPermission {
  status: 'granted' | 'denied' | 'undetermined';
  granted: boolean;
  canAskAgain: boolean;
}

/** One file MediaStore flags as music. */
export interface MediaAudio {
  /** `content://media/external/audio/media/<id>`, playable and readable as is. */
  uri: string;
  name: string;
  size: number;
  /** Seconds since the epoch. */
  modified: number;
  mimeType: string | null;
}

/** Tags, identity and saved cover of one file; null where a tag is missing. */
export interface TrackTags {
  /** `"a1:<hex sha256>"`, the desktop's `tracks.content_hash` for the same file. */
  contentHash: string;
  size: number;
  title: string | null;
  artist: string | null;
  album: string | null;
  albumArtist: string | null;
  trackNumber: number | null;
  year: number | null;
  genre: string | null;
  durationMs: number | null;
  /** `file://` uri of the downscaled JPEG, named after the content hash. */
  artUri: string | null;
}

export interface AudioLibraryModule {
  getPermissionAsync(): Promise<AudioPermission>;
  requestPermissionAsync(): Promise<AudioPermission>;
  queryAudioAsync(): Promise<MediaAudio[]>;
  /** One entry per uri, in order; null for a file that could not be opened. */
  readTracksAsync(uris: string[], artDir: string): Promise<(TrackTags | null)[]>;
}

/** Android only; null where the native module is not built in (web, iOS, Jest). */
export const AudioLibrary = requireOptionalNativeModule<AudioLibraryModule>('AudioLibrary');
