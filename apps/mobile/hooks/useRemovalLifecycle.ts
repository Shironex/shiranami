import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useRemovalStore } from '@/stores/useRemovalStore';

/** Finalises a pending removal when the app leaves the foreground, so it never waits on a timer. */
export function useRemovalLifecycle(): void {
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') void useRemovalStore.getState().commit();
    });
    return () => sub.remove();
  }, []);
}
