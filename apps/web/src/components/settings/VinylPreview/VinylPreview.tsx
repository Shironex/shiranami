import { cn } from '@/lib/utils';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { VinylRecord } from '@/components/shared/VinylRecord';
import { useVinylPreview } from './VinylPreview.hooks';
import type { IVinylPreviewProps } from './VinylPreview.types';

export default function VinylPreview(props: IVinylPreviewProps) {
  const { title, enabled, stages, albumArt } = useVinylPreview(props);

  const stageMiniatures = stages.map(stage => (
    <div
      key={stage.id}
      data-slot={`vinyl-preview-${stage.id}`}
      className={cn(
        'flex flex-col items-center gap-2 transition-opacity',
        enabled ? 'opacity-100' : 'opacity-25'
      )}
    >
      <div
        className="transition-[width,height] duration-300"
        style={{ width: stage.px, height: stage.px }}
      >
        <VinylRecord albumArt={albumArt} albumAlt={stage.caption} />
      </div>
      <span className="text-[10px] leading-none text-muted-foreground">{stage.caption}</span>
    </div>
  ));

  return (
    <SettingsPreview title={title}>
      <div
        className="rounded-xl border border-border/30 bg-background/40 p-3"
        role="img"
        aria-label={title}
      >
        <div className="relative mx-auto flex h-[150px] max-w-[340px] items-end justify-center gap-10 overflow-hidden rounded-xl border border-border/25 bg-surface/60 p-3 pb-4">
          {stageMiniatures}
        </div>
      </div>
    </SettingsPreview>
  );
}
