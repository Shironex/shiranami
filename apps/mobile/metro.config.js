const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// expo/metro-config detects the pnpm workspace root and sets watchFolders and
// nodeModulesPaths itself.
const config = getDefaultConfig(__dirname);

// The web app and the landing site use a newer React than the one Expo SDK 57
// pins, and pnpm's hidden hoist folder (node_modules/.pnpm/node_modules) holds
// theirs. A dependency that requires `react` without declaring it would walk up
// into that copy and put a second React in the bundle, which crashes at startup
// because react-native's renderer checks the exact version. Every `react`
// import therefore resolves from this app, whoever asks.
const APP_REACT_PACKAGES = ['react'];

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isAppReact = APP_REACT_PACKAGES.some(
    name => moduleName === name || moduleName.startsWith(`${name}/`)
  );
  const resolve = defaultResolveRequest ?? context.resolveRequest;
  if (isAppReact) {
    return resolve(
      { ...context, originModulePath: path.join(__dirname, 'package.json') },
      moduleName,
      platform
    );
  }
  return resolve(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css', inlineRem: 16 });
