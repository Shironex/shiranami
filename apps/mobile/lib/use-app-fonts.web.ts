import { useFonts } from 'expo-font';
import { fontFamily } from '@/theme/fonts';

/**
 * The config plugin only embeds fonts in native builds, so the web preview
 * loads the same files at runtime under the same family names.
 */
export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    [fontFamily.body]: require('@expo-google-fonts/dm-sans/400Regular/DMSans_400Regular.ttf'),
    [fontFamily[
      'body-medium'
    ]]: require('@expo-google-fonts/dm-sans/500Medium/DMSans_500Medium.ttf'),
    [fontFamily[
      'body-semibold'
    ]]: require('@expo-google-fonts/dm-sans/600SemiBold/DMSans_600SemiBold.ttf'),
    [fontFamily['display-medium']]: require('@expo-google-fonts/sora/500Medium/Sora_500Medium.ttf'),
    [fontFamily.display]: require('@expo-google-fonts/sora/600SemiBold/Sora_600SemiBold.ttf'),
    [fontFamily.kanji]: require('../assets/fonts/ShipporiMincho_700Bold.ttf'),
  });
  return loaded;
}
