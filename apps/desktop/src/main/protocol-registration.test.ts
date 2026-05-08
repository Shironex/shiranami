import { describe, it, expect } from 'vitest';
import { PRIVILEGED_SCHEMES } from './privileged-schemes';

// Schemes loaded by audio deck elements (crossOrigin = 'anonymous') must have
// corsEnabled: true — Chromium rejects the load before the protocol handler
// runs otherwise, breaking YouTube previews and RadioBrowser stations.
const AUDIO_DECK_SCHEMES = ['shiranami-audio', 'shiranami-radio'] as const;

describe('protocol registration', () => {
  it('gives every audio-deck scheme corsEnabled: true', () => {
    for (const name of AUDIO_DECK_SCHEMES) {
      const entry = PRIVILEGED_SCHEMES.find(s => s.scheme === name);
      expect(entry, `${name} must be registered`).toBeDefined();
      expect(
        entry?.privileges?.corsEnabled,
        `${name} must have corsEnabled: true — the renderer audio decks set ` +
          `crossOrigin='anonymous', so Chromium requires corsEnabled or it rejects ` +
          `the load before the protocol handler runs`
      ).toBe(true);
    }
  });
});
