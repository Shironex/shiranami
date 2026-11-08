/**
 * On Android and iOS the expo-font config plugin embeds the fonts at build
 * time (app.json), so they are ready before the first frame.
 */
export function useAppFonts(): boolean {
  return true;
}
