import appConfig from '../app.json';
import generated from '../theme/colors.json';
import { fontFamily } from '../theme/fonts';

const { buildColors } = jest.requireActual('../theme/build-colors');
const { oklchToHex } = jest.requireActual('../theme/oklch');

describe('color tokens', () => {
  it('colors.json matches palette.js (run `pnpm tokens` after editing the palette)', () => {
    expect(generated).toEqual(buildColors());
  });

  it('converts OKLCH like the browser does', () => {
    // Pixel colors read from the mockup rendered in Chromium.
    expect(oklchToHex(0.08, 0.02, 280)).toBe('#010105');
    expect(oklchToHex(0.17, 0.028, 280)).toBe('#0d0e1b');
    expect(oklchToHex(1, 0, 0, 0.06)).toBe('#ffffff0f');
  });
});

describe('embedded fonts', () => {
  const plugin = appConfig.expo.plugins.find(
    (entry): entry is [string, { fonts: string[] }] =>
      Array.isArray(entry) && entry[0] === 'expo-font'
  );
  const embedded = (plugin?.[1].fonts ?? []).map(file =>
    file.replace(/^.*\//, '').replace('.ttf', '')
  );

  it('embeds exactly the families the theme names', () => {
    expect([...embedded].sort()).toEqual(Object.values(fontFamily).sort());
  });
});
