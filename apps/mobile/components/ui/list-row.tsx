import type { ReactNode } from 'react';
import { Pressable, View, type PressableProps } from 'react-native';
import { cn } from '@/lib/utils';
import { Text } from './text';

interface ListRowProps extends Omit<PressableProps, 'children'> {
  art: ReactNode;
  title: string;
  meta?: string;
  /** Trailing content inside the row's tap area: duration, heart, eq bars. */
  end?: ReactNode;
  /**
   * Trailing buttons. They sit beside the tap area, not inside it, so no
   * button is nested in another.
   */
  actions?: ReactNode;
  /** The playing row: a quiet primary fill and a primary title, no stripe. */
  active?: boolean;
}

/** The 64pt track, station and playlist row. */
export function ListRow({
  art,
  title,
  meta,
  end,
  actions,
  active = false,
  ...props
}: ListRowProps) {
  return (
    <View className={cn('flex-row items-center rounded-lg', active && 'bg-primary-tint')}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        className={cn(
          'min-h-16 flex-1 flex-row items-center gap-3.5 rounded-lg py-2 pl-3',
          actions ? 'pr-1' : 'pr-3',
          !active && 'active:bg-border'
        )}
        {...props}
      >
        {art}
        <View className="min-w-0 flex-1">
          <Text variant="rowTitle" numberOfLines={1} className={cn(active && 'text-primary')}>
            {title}
          </Text>
          {!!meta && (
            <Text variant="meta" numberOfLines={1} className="mt-0.5">
              {meta}
            </Text>
          )}
        </View>
        {end != null && <View className="flex-row items-center gap-2.5">{end}</View>}
      </Pressable>
      {actions != null && <View className="flex-row items-center pr-1">{actions}</View>}
    </View>
  );
}

/** Small muted label above a group of rows ("Added today", "Favorites"). */
export function GroupLabel({ children, className }: { children: string; className?: string }) {
  return (
    <Text variant="label" role="heading" className={cn('px-3 pb-1.5 pt-[22px]', className)}>
      {children}
    </Text>
  );
}

/** Tabular, muted trailing text such as a duration. */
export function RowMeta({ children }: { children: string }) {
  return (
    <Text variant="meta" style={{ fontVariant: ['tabular-nums'] }}>
      {children}
    </Text>
  );
}
