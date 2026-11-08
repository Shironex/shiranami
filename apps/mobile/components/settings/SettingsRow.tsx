import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';

interface SettingsRowProps {
  label: string;
  hint?: string;
  children?: ReactNode;
}

/** One settings line: a label, an optional muted hint and a trailing control. */
export function SettingsRow({ label, hint, children }: SettingsRowProps) {
  return (
    <View className="min-h-16 flex-row items-center gap-4 px-6 py-3">
      <View className="min-w-0 flex-1">
        <Text variant="option">{label}</Text>
        {!!hint && (
          <Text variant="meta" className="mt-0.5">
            {hint}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

/** Tabular, muted trailing value such as the version number. */
export function SettingsValue({ children }: { children: string }) {
  return (
    <Text variant="meta" style={{ fontVariant: ['tabular-nums'] }}>
      {children}
    </Text>
  );
}
