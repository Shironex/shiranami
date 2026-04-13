import { useAppVersionQuery } from '@/hooks/queries/useApp';

/**
 * Back-compat wrapper returning just the version string.
 * New code should use `useAppVersionQuery` from `@/hooks/queries/useApp`.
 */
export function useAppVersion() {
  const { data } = useAppVersionQuery();
  return data;
}
