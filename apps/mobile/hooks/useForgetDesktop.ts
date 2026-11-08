import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useDesktopSync } from '@/hooks/useDesktopSync';

/**
 * "Forget this desktop" with its confirmation, and a follow-up when the
 * desktop could not be told (it then still lists this phone).
 */
export function useForgetDesktop(name: string, onForgotten?: () => void) {
  const { forget } = useDesktopSync();
  return useCallback(
    () =>
      Alert.alert(`Forget ${name}?`, 'The songs it brought over stay on this phone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget',
          style: 'destructive',
          onPress: async () => {
            const told = await forget();
            if (!told) {
              Alert.alert(
                'Forgotten on this phone',
                `${name} could not be reached. Remove this phone under Sync with phone on the desktop too.`
              );
            }
            onForgotten?.();
          },
        },
      ]),
    [forget, name, onForgotten]
  );
}
