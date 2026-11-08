const expoPreset = require('jest-expo/android/jest-preset');

// Packages published as untranspiled JSX (@rn-primitives) or as ES modules
// only (@noble, which @shiranami/contracts/sync uses for the LAN sync crypto).
// The preset only sends its own list (react-native, expo, ...) through Babel,
// so without an entry here the first test importing one fails with a syntax
// error.
const UNTRANSPILED_PACKAGES = ['@rn-primitives', '@noble'];

// Start of the allowlist in the preset's pattern: `/node_modules/(?!(...))`.
const ALLOWLIST_START = '(?!(';

const transformIgnorePatterns = expoPreset.transformIgnorePatterns.map(pattern =>
  pattern.replace(ALLOWLIST_START, `${ALLOWLIST_START}${UNTRANSPILED_PACKAGES.join('|')}|`)
);

// If the preset changes the shape of its pattern the replacement does nothing,
// and the failure would surface as a syntax error deep in node_modules.
if (transformIgnorePatterns.join() === expoPreset.transformIgnorePatterns.join()) {
  throw new Error(
    'jest.config.js: jest-expo changed transformIgnorePatterns, update how UNTRANSPILED_PACKAGES is added.'
  );
}

module.exports = {
  // The default `jest-expo` preset resolves iOS files (`*.ios.tsx`); Android is
  // the release target.
  preset: 'jest-expo/android',
  testMatch: ['<rootDir>/test/**/*.test.{ts,tsx}'],
  setupFilesAfterEnv: [...(expoPreset.setupFilesAfterEnv ?? []), '<rootDir>/test/support/setup.ts'],
  testPathIgnorePatterns: [...expoPreset.testPathIgnorePatterns, '<rootDir>/android/'],
  // A module mock lives for the whole file; without resetting the call counts
  // `toHaveBeenCalled` could pass on a call from the previous test.
  clearMocks: true,
  // The first route test in a file also pays for loading the whole tree.
  testTimeout: 20000,
  transformIgnorePatterns,
  moduleNameMapper: {
    // Metro compiles global.css through NativeWind; in tests it is empty.
    '\\.css$': '<rootDir>/test/stubs/style.js',
    // For React Native the package points at `.mjs` files the preset does not
    // transform. The same icon from the CommonJS build needs no Babel.
    '^lucide-react-native/icons/(.*)$':
      '<rootDir>/node_modules/lucide-react-native/dist/cjs/icons/$1.js',
  },
};
