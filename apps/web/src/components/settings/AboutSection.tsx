import { useState, useEffect } from 'react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Info } from 'lucide-react';
import { IS_ELECTRON } from '@/lib/platform';

export function AboutSection() {
  const [version, setVersion] = useState('0.1.0');

  useEffect(() => {
    if (!IS_ELECTRON) return;

    async function loadVersion() {
      try {
        const appVersion = await window.electronAPI.app.getVersion();
        setVersion(appVersion);
      } catch (err) {
        console.error('Failed to load app version:', err);
      }
    }

    loadVersion();
  }, []);

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
