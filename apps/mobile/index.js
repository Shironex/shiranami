import TrackPlayer from 'react-native-track-player';
import { playbackService } from './lib/track-player-service';

// Register the playback service — must be done at the top level, not inside a component
TrackPlayer.registerPlaybackService(() => playbackService);
