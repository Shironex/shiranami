import { cn } from '@/lib/utils';
import { PreviewFrame } from '@/components/settings/PreviewFrame';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { useLibraryBannerPreview } from './LibraryBannerPreview.hooks';
import type { ILibraryBannerPreviewProps } from './LibraryBannerPreview.types';

export default function LibraryBannerPreview(props: ILibraryBannerPreviewProps) {
  const { title, enabled } = useLibraryBannerPreview(props);

  return (
    <SettingsPreview title={title}>
      <PreviewFrame label={title} canvasClassName="p-3">
        <div
          className={cn(
            'mb-3 flex items-center gap-3 overflow-hidden rounded-lg border border-border/25 bg-primary/10 p-2 transition-all',
            enabled ? 'h-16 opacity-100' : 'h-0 border-transparent p-0 opacity-0'
          )}
        >
          <div className="size-10 shrink-0 rounded-md bg-primary/25" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-2.5 w-24 rounded-full bg-foreground/25" />
            <div className="h-1.5 w-16 rounded-full bg-muted-foreground/25" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="h-16 rounded-lg bg-muted/30" />
          <div className="h-16 rounded-lg bg-muted/25" />
          <div className="h-16 rounded-lg bg-muted/20" />
        </div>
      </PreviewFrame>
    </SettingsPreview>
  );
}
