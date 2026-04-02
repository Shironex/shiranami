const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch only shared packages (not entire root) to avoid picking up
// web/desktop dependencies that bundle their own React 18.x copies
config.watchFolders = [path.resolve(monorepoRoot, 'packages')];

// Resolve node_modules from both the app and the monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Force singleton resolution for packages that must only exist once.
// In the monorepo, packages like lucide-react, sonner, radix-ui etc.
// from web/desktop get nested React 18 copies. Metro must skip those.
const singletonPaths = {
  react: path.resolve(monorepoRoot, 'node_modules/react'),
  'react-native': path.resolve(monorepoRoot, 'node_modules/react-native'),
  'react-dom': path.resolve(monorepoRoot, 'node_modules/react-dom'),
};

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (singletonPaths[moduleName]) {
    return context.resolveRequest(
      { ...context, originModulePath: projectRoot + '/index.js' },
      moduleName,
      platform,
    );
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css', inlineRem: 16 });
