import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from './text';

interface EmptyStateProps {
  title: string;
  body?: string;
  children?: ReactNode;
}

/** A short, honest note where a list has nothing to show, plus optional actions. */
export function EmptyState({ title, body, children }: EmptyStateProps) {
  return (
    <View className="items-center px-6 pb-6 pt-10">
      <Text variant="heading" className="text-center text-[20px] leading-[25px]">
        {title}
      </Text>
      {!!body && (
        <Text variant="bodyMuted" className="mt-2 max-w-[300px] text-center">
          {body}
        </Text>
      )}
      {children && <View className="mt-6 items-center gap-1">{children}</View>}
    </View>
  );
}
