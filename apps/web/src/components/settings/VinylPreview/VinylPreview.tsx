import { cn } from '@/lib/utils';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { VinylRecord } from '@/components/shared/VinylRecord';
import { useVinylPreview } from './VinylPreview.hooks';
import type { IVinylPreviewProps } from './VinylPreview.types';

export default function VinylPreview(props: IVinylPreviewProps) {
  const { title, enabled } = useVinylPreview(props);

  return (
    <SettingsPreview title={title}>
      <div
        className="rounded-xl border border-border/30 bg-background/40 p-3"
        role="img"
        aria-label={title}
      >
        <div className="relative mx-auto flex h-[140px] max-w-[340px] items-center justify-center overflow-hidden rounded-xl border border-border/25 bg-surface/60 p-3">
          <div
            className={cn(
              'size-[104px] transition-opacity',
              enabled ? 'opacity-100' : 'opacity-25'
            )}
          >
            <VinylRecord albumArt={null} albumAlt={title} />
          </div>
        </div>
      </div>
    </SettingsPreview>
  );
}
