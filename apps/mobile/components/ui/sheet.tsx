import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cn } from '@/lib/utils';
import { Text } from './text';

interface SheetProps {
  title: string;
  subtitle?: string;
  /** Sits right of the title, e.g. a Clear button. */
  action?: ReactNode;
  /** Pinned under the content: Cancel / Start. */
  footer?: ReactNode;
  children?: ReactNode;
  /** Scroll the body (playlist picker); short sheets do not. */
  scroll?: boolean;
  /** Fill the sheet's height and let the child scroll itself (a FlatList). */
  fill?: boolean;
}

/**
 * Content of a bottom sheet route (expo-router `formSheet`). Android draws
 * neither a grabber nor a title in form sheets, so both live here.
 */
export function Sheet({
  title,
  subtitle,
  action,
  footer,
  children,
  scroll = false,
  fill = false,
}: SheetProps) {
  const insets = useSafeAreaInsets();
  const Body = scroll ? ScrollView : View;
  const grow = scroll || fill;
  return (
    <View
      className={cn('bg-sheet', grow && 'flex-1')}
      style={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}
    >
      <View className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-handle" />
      <View className="flex-row items-center justify-between pb-1 pl-6 pr-3 pt-5">
        <Text variant="sheetTitle" className="flex-1">
          {title}
        </Text>
        {action}
      </View>
      {!!subtitle && (
        <Text variant="meta" className="px-6 pb-3 text-[14px]">
          {subtitle}
        </Text>
      )}
      {children ? <Body className={cn(grow && 'flex-1')}>{children}</Body> : null}
      {footer && <View className="flex-row justify-end gap-2 px-6 pt-4">{footer}</View>}
    </View>
  );
}

interface SheetOptionProps {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
}

/** A radio row in a sheet. */
export function SheetOption({ label, hint, selected, onPress }: SheetOptionProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className={cn(
        'h-14 flex-row items-center justify-between px-6',
        selected ? 'bg-primary-tint' : 'active:bg-border'
      )}
    >
      <Text variant="option">{label}</Text>
      <View className="flex-row items-center">
        {!!hint && (
          <Text
            variant="meta"
            className="mr-3.5 text-[14px]"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {hint}
          </Text>
        )}
        <View
          className={cn(
            'h-[22px] w-[22px] items-center justify-center rounded-full border-2',
            selected ? 'border-primary' : 'border-muted-foreground'
          )}
        >
          {selected && <View className="h-3 w-3 rounded-full bg-primary" />}
        </View>
      </View>
    </Pressable>
  );
}

export function SheetDivider() {
  return <View className="mx-6 my-2 h-px bg-border" />;
}
