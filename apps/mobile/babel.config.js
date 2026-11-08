module.exports = function (api) {
  api.cache(true);
  return {
    // `jsxImportSource: 'nativewind'` routes JSX through NativeWind, which turns
    // `className` into styles, and `nativewind/babel` adds the CSS interop
    // transform. babel-preset-expo injects the worklets/reanimated plugin
    // itself, so it is not listed here.
    //
    // `nativewind/babel` names `@babel/plugin-transform-react-jsx` as a string,
    // and Babel resolves plugins from this file's directory, not from the preset
    // asking for them. Under pnpm's isolated node_modules the preset's own copy
    // is invisible from here, so the plugin is a devDependency of this package
    // even though nothing imports it. `pnpm run` finds it anyway (it sets
    // NODE_PATH), but Gradle calls node directly and the release bundle fails.
    // Kept on the 7.x line: 8.x requires @babel/core 8.
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
