import { TextInput, View } from 'react-native';
import Search from 'lucide-react-native/icons/search';
import X from 'lucide-react-native/icons/x';
import { colors } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { IconButton } from './icon-button';

interface SearchFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  /** Read by screen readers; the placeholder disappears once typing starts. */
  accessibilityLabel: string;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
  className?: string;
}

/** Pill search input with a clear button once there is text. */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  autoFocus,
  onSubmitEditing,
  className,
}: SearchFieldProps) {
  return (
    <View
      className={cn(
        'h-14 flex-row items-center gap-3 rounded-full bg-muted pl-5 pr-1.5',
        className
      )}
    >
      <Search size={20} color={colors.mutedForeground} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        autoFocus={autoFocus}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        className="h-full flex-1 font-body text-[16px] text-foreground"
        returnKeyType="search"
        onSubmitEditing={onSubmitEditing}
        accessibilityLabel={accessibilityLabel}
      />
      {value.length > 0 && (
        <IconButton
          icon={X}
          size={18}
          accessibilityLabel="Clear"
          onPress={() => onChangeText('')}
        />
      )}
    </View>
  );
}
