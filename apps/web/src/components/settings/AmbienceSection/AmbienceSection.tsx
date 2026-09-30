import { CloudRain, Moon, Info } from 'lucide-react';
import { SettingsCard, SettingsInfoCallout } from '@/components/settings/SettingsCard';
import { AmbienceMixer } from '@/components/player/AmbienceMixer';
import { useAmbienceSection } from './AmbienceSection.hooks';

/**
 * Settings · Ambience. The same mixer the player bar opens, rendered inline,
 * plus the notes that explain how ambience behaves and where its sounds come
 * from.
 */
export default function AmbienceSection() {
  const { title, subtitle, sleepNote, credit } = useAmbienceSection();

  return (
    <SettingsCard icon={CloudRain} title={title} subtitle={subtitle}>
      <div className="px-1">
        <AmbienceMixer inline />
      </div>
      <SettingsInfoCallout icon={Moon}>{sleepNote}</SettingsInfoCallout>
      <SettingsInfoCallout icon={Info}>{credit}</SettingsInfoCallout>
    </SettingsCard>
  );
}
