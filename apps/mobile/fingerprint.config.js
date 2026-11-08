// The runtime version is the project fingerprint (app.json `runtimeVersion`),
// so it has to come out the same on every machine that builds or publishes:
// EAS's Linux builders, the Mac and the Windows PC.
//
// The autolinking config that goes into the hash lists each native package's
// folder. Under pnpm that folder sits in the virtual store
// (`node_modules/.pnpm/<name>@<version>_<peers>/node_modules/<name>`), and pnpm
// shortens those folder names differently per OS (120 characters, 60 on
// Windows). Package versions are hashed on their own (`packageVersion`), so the
// store segment only adds noise; it is dropped before hashing.
//
// package.json scripts are skipped as a whole. The default only skips them
// when the `android` script has no `run`, and ours is `expo run:android`, so
// renaming a lint script would otherwise ask for a new native build.

const PNPM_STORE_SEGMENT = /node_modules\/\.pnpm\/[^/]+\/node_modules\//g;
const AUTOLINKING_SOURCE = /AutolinkingConfig:/;

/** @type {import('expo/fingerprint').Config} */
module.exports = {
  sourceSkips: ['PackageJsonScriptsAll'],
  fileHookTransform: (source, chunk) => {
    if (source.type === 'contents' && AUTOLINKING_SOURCE.test(source.id)) {
      return String(chunk).replace(PNPM_STORE_SEGMENT, 'node_modules/');
    }
    return chunk;
  },
};
