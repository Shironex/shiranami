import { Image, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PreviewFrame } from '@/components/settings/PreviewFrame';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { useNowPlayingViewPreview } from './NowPlayingViewPreview.hooks';
import type { INowPlayingViewPreviewProps } from './NowPlayingViewPreview.types';

export default function NowPlayingViewPreview(props: INowPlayingViewPreviewProps) {
  const { title, enabled } = useNowPlayingViewPreview(props);

  return (
    <SettingsPreview title={title}>
      <PreviewFrame label={title} size="scene" canvasClassName="p-3">
        <div
          className={cn(
            'absolute inset-0 transition-opacity',
            enabled ? 'opacity-100' : 'opacity-25'
          )}
          style={{
            background:
              'radial-gradient(circle at 22% 18%, rgba(var(--primary-rgb), 0.35), transparent 34%), linear-gradient(135deg, rgba(255,255,255,0.05), transparent)',
          }}
        />
        <div className="relative flex h-full items-center gap-3">
          <div className="flex size-20 shrink-0 items-center justify-center rounded-xl border border-border/25 bg-primary/15 text-primary">
            <Image className="size-8" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-28 rounded-full bg-foreground/25" />
            <div className="h-2 w-20 rounded-full bg-muted-foreground/25" />
            <div className="mt-4 flex items-center gap-2">
              <div className="size-7 rounded-full bg-primary/35" />
              <div className="h-1.5 flex-1 rounded-full bg-muted/35" />
            </div>
          </div>
          <div
            className={cn(
              'absolute right-3 top-3 flex size-8 items-center justify-center rounded-lg border border-border/25',
              enabled ? 'bg-primary/20 text-primary' : 'bg-muted/20 text-muted-foreground/50'
            )}
          >
            <Maximize2 className="size-3.5" />
          </div>
        </div>
      </PreviewFrame>
    </SettingsPreview>
  );
}
