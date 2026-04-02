const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// Expo SDK 54 auto-detects monorepo structure from pnpm-workspace.yaml:
// - watchFolders: includes root node_modules (.pnpm store), all workspace dirs
// - nodeModulesPaths: includes app + monorepo root node_modules
// No manual overrides needed — let Expo handle pnpm symlink resolution.
const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css', inlineRem: 16 });
