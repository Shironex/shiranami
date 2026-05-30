/**
 * Database schema exports
 */

export { tracks, type Track, type NewTrack } from './tracks.js';

export { playlists, type Playlist, type NewPlaylist } from './playlists.js';

export { playlistTracks, type PlaylistTrack, type NewPlaylistTrack } from './playlist-tracks.js';

export { folders, type Folder, type NewFolder } from './folders.js';

export { radioFavorites, type RadioFavorite, type NewRadioFavorite } from './radio-favorites.js';

export { playHistory, type PlayHistory, type NewPlayHistory } from './play-history.js';

export {
  youtubeMappings,
  type YoutubeMapping,
  type NewYoutubeMapping,
} from './youtube-mappings.js';

export { recommendations, type Recommendation, type NewRecommendation } from './recommendations.js';

export {
  negativeSignals,
  type NegativeSignal,
  type NewNegativeSignal,
} from './negative-signals.js';
