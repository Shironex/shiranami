import { Children, Fragment, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import type { IconComponent } from '@/components/ui/icon';
import { GroupLabel } from '@/components/ui/list-row';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';

interface SettingsRowProps {
  label: string;
  hint?: string;
  icon?: IconComponent;
  /** Makes the whole row a button (rows that open or switch something). */
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  children?: ReactNode;
}

/** One settings line: an icon, a label, an optional muted hint and a trailing control. */
export function SettingsRow({
  label,
  hint,
  icon: Icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  children,
}: SettingsRowProps) {
  const body = (
    <>
      {Icon && (
        <View className="h-10 w-10 items-center justify-center rounded-[13px] bg-primary-tonal">
          <Icon size={20} color={colors.dockIcon} />
        </View>
      )}
      <View className="min-w-0 flex-1">
        <Text variant="option">{label}</Text>
        {!!hint && (
          <Text variant="meta" className="mt-0.5">
            {hint}
          </Text>
        )}
      </View>
      {children}
    </>
  );
  const className = 'min-h-16 flex-row items-center gap-4 px-2 py-3';
  if (!onPress) return <View className={className}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      className={`${className} rounded-2xl active:bg-border`}
    >
      {body}
    </Pressable>
  );
}

/** A heading and its rows on one soft panel, with hairlines between rows. */
export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View className="px-4">
      <GroupLabel className="px-2">{title}</GroupLabel>
      <View className="mt-1.5 rounded-[20px] border border-border bg-card px-2 py-0.5">
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 && <View className="h-px bg-border" />}
            {row}
          </Fragment>
        ))}
      </View>
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
