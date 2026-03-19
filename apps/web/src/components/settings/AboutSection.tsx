import { SettingsCard } from '@/components/settings/SettingsCard';
import { useAppVersion } from '@/hooks/useAppVersion';
import { Info } from 'lucide-react';

export function AboutSection() {
  const version = useAppVersion();

  return (
    <SettingsCard
      icon={Info}
      title="About"
      subtitle="Application information"
    >
      <div className="flex items-center gap-4 px-3 py-3">
        <img
          src="./mascot.png"
          alt="Shiranami mascot"
          className="w-16 h-16 rounded-2xl object-contain"
          draggable={false}
        />
        <div>
          <h4 className="font-display text-base font-semibold text-foreground">
            Shiranami
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
            Version {version}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1 italic">
            {'\u767D\u6CE2'} &mdash; Your personal music sanctuary
          </p>
          <p className="text-[10px] text-muted-foreground/40 mt-2">
            Made with &#9829;
          </p>
        </div>
      </div>
    </SettingsCard>
  );
}
