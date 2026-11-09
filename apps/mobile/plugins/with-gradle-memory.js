const { withGradleProperties } = require('expo/config-plugins');

// The template's gradle.properties caps the Gradle daemon at 512 MB of
// Metaspace. Since SDK 57 the KSP step of a release build runs out of it
// ("OutOfMemoryError: Metaspace"), so prebuild writes larger limits for the
// Gradle and Kotlin daemons. Applies to local builds and EAS alike.
const PROPERTIES = {
  'org.gradle.jvmargs': '-Xmx4096m -XX:MaxMetaspaceSize=1536m',
  'kotlin.daemon.jvmargs': '-Xmx3072m -XX:MaxMetaspaceSize=1024m',
};

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, gradle => {
    for (const [key, value] of Object.entries(PROPERTIES)) {
      const existing = gradle.modResults.find(item => item.type === 'property' && item.key === key);
      if (existing) existing.value = value;
      else gradle.modResults.push({ type: 'property', key, value });
    }
    return gradle;
  });
};
