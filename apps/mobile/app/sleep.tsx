import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui/button';
import { Sheet, SheetDivider, SheetOption } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { useNow } from '@/hooks/useNow';
import { useSleepLabel } from '@/hooks/useSleepLabel';
import { formatClock } from '@/lib/format';
import { SLEEP_PRESETS } from '@/lib/sleep-timer';
import { useSleepTimerStore } from '@/stores/useSleepTimerStore';

type Choice = number | 'end';

/** Picks a sleep timer, or shows the running one with a way to turn it off. */
export default function SleepSheet() {
  const router = useRouter();
  const now = useNow(30_000);
  const running = useSleepLabel();
  const savedFade = useSleepTimerStore(s => s.fade);
  const endsAt = useSleepTimerStore(s => s.endsAt);
  const start = useSleepTimerStore(s => s.start);
  const startEndOfTrack = useSleepTimerStore(s => s.startEndOfTrack);
  const cancel = useSleepTimerStore(s => s.cancel);
  const [choice, setChoice] = useState<Choice>(30);
  const [fade, setFade] = useState(savedFade);

  const close = () => router.back();
  const onStart = () => {
    if (choice === 'end') startEndOfTrack(fade);
    else start(choice, fade);
    close();
  };

  if (running) {
    return (
      <Sheet
        title="Sleep timer"
        subtitle={
          endsAt
            ? `Music stops at ${formatClock(endsAt)}, in ${running}.`
            : 'Music stops when this song ends.'
        }
        footer={
          <>
            <Button label="Keep" variant="text" onPress={close} />
            <Button
              label="Turn off"
              onPress={() => {
                cancel();
                close();
              }}
            />
          </>
        }
      />
    );
  }

  return (
    <Sheet
      title="Sleep timer"
      subtitle={fade ? 'Music fades out, then stops.' : 'Music stops.'}
      footer={
        <>
          <Button label="Cancel" variant="text" onPress={close} />
          <Button label="Start" onPress={onStart} />
        </>
      }
    >
      <View accessibilityRole="radiogroup">
        {SLEEP_PRESETS.map(preset => (
          <SheetOption
            key={preset.minutes}
            label={preset.label}
            hint={`until ${formatClock(now + preset.minutes * 60_000)}`}
            selected={choice === preset.minutes}
            onPress={() => setChoice(preset.minutes)}
          />
        ))}
        <SheetOption
          label="End of this song"
          selected={choice === 'end'}
          onPress={() => setChoice('end')}
        />
      </View>
      <SheetDivider />
      <View className="min-h-16 flex-row items-center justify-between px-6">
        <View className="flex-1 pr-4">
          <Text variant="option">Fade out</Text>
          <Text variant="meta" className="mt-0.5">
            Over the last 2 minutes
          </Text>
        </View>
        <Switch value={fade} onValueChange={setFade} accessibilityLabel="Fade out" />
      </View>
    </Sheet>
  );
}
