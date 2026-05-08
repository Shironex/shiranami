import type { CustomScheme } from 'electron';

// All renderer-facing custom schemes that audio deck elements load with
// crossOrigin = 'anonymous' set must have corsEnabled: true. Chromium
// rejects the load before the protocol handler runs otherwise.
// Exported for structural assertions in protocol-registration.test.ts.
export const PRIVILEGED_SCHEMES: CustomScheme[] = [
  {
    scheme: 'shiranami-audio',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false,
      // Required so MediaElementAudioSource (Web Audio graph) gets actual
      // samples instead of silent zeroes — connecting a cross-origin audio
      // element to AudioContext silently outputs zeroes by default.
      corsEnabled: true,
    },
  },
  {
    scheme: 'shiranami-radio',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false,
      // Required because the renderer's audio decks load with
      // crossOrigin = 'anonymous' so MediaElementAudioSource gets real
      // samples for the EQ / analyser chain. Without corsEnabled, Chromium
      // rejects the load before the protocol handler runs, breaking YouTube
      // previews and RadioBrowser stations in packaged builds.
      corsEnabled: true,
    },
  },
  {
    scheme: 'shiranami-art',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: false,
      bypassCSP: false,
      // Required so the renderer can draw covers onto a <canvas> for
      // FastAverageColor / getImageData without Chromium tainting the
      // canvas as cross-origin.
      corsEnabled: true,
    },
  },
];
