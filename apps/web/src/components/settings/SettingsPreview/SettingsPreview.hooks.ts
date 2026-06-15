import type { ISettingsPreviewProps, ISettingsPreviewView } from './SettingsPreview.types';

/**
 * SettingsPreview is a pure layout primitive (caption + content); the hook
 * forwards its props so the shell stays a thin, logic-free render.
 */
export function useSettingsPreview({
  title,
  children,
}: ISettingsPreviewProps): ISettingsPreviewView {
  return { title, children };
}
