import { useOpenLogsFolderMutation } from '@/hooks/queries/useApp';

export { useAppVersion } from '@/hooks/useAppVersion';

export function useAbout() {
  const openLogsFolder = useOpenLogsFolderMutation();
  return { openLogsFolder };
}
