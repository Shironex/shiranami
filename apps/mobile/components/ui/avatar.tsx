import { Image, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

const MASCOT = require('../../assets/images/mascot.png');

/** The mascot as the app's avatar; opens Settings. */
export function Avatar({ size = 34 }: { size?: number }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Settings"
      onPress={() => router.push('/settings')}
      className="h-11 w-11 items-center justify-center"
    >
      <View
        className="overflow-hidden rounded-lg border border-primary-ring bg-primary-tonal"
        style={{ width: size, height: size }}
      >
        <Image
          source={MASCOT}
          accessibilityIgnoresInvertColors
          style={{
            width: size * 2.3,
            height: size * 2.3,
            marginLeft: -size * 0.66,
            marginTop: -size * 0.1,
          }}
        />
      </View>
    </Pressable>
  );
}
