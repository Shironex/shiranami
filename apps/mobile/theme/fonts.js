/**
 * Font families as the expo-font config plugin registers them: each embedded
 * file is its own family named after the file, so a weight is picked by
 * family, never by `fontWeight` (Android would synthesize a fake bold).
 */
const fontFamily = {
  body: 'DMSans_400Regular',
  'body-medium': 'DMSans_500Medium',
  'body-semibold': 'DMSans_600SemiBold',
  'display-medium': 'Sora_500Medium',
  display: 'Sora_600SemiBold',
  kanji: 'ShipporiMincho_700Bold',
};

module.exports = { fontFamily };
