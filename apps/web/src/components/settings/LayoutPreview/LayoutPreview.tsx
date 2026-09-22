import { PreviewFrame } from '@/components/settings/PreviewFrame';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { useLayoutPreview } from './LayoutPreview.hooks';

export default function LayoutPreview() {
  const {
    title,
    sidePanelOnLeft,
    sidePanelOnRight,
    visualizerOnTop,
    visualizerOnBottom,
    vizBarHeights,
  } = useLayoutPreview();

  const sidePanelMock = (
    <div className="w-9 shrink-0 space-y-1 rounded-md border border-primary/30 bg-primary/15 p-1.5">
      <div className="h-1 w-6 rounded-full bg-primary/40" />
      <div className="h-1 w-5 rounded-full bg-primary/25" />
      <div className="h-1 w-6 rounded-full bg-primary/25" />
    </div>
  );

  const vizBars = vizBarHeights.map((h, i) => (
    <div key={i} className="w-1 rounded-sm bg-primary/45" style={{ height: `${h}%` }} />
  ));

  const visualizerMock = (
    <div className="flex h-3.5 shrink-0 items-end justify-center gap-0.5 rounded-md border border-primary/30 bg-primary/15 px-1.5 py-0.5">
      {vizBars}
    </div>
  );

  return (
    <SettingsPreview title={title}>
      <PreviewFrame label={title} size="scene" canvasClassName="flex gap-1.5 p-2">
        {/* Sidebar — not movable in v1 */}
        <div className="w-8 shrink-0 space-y-1 rounded-md border border-border/25 bg-muted/20 p-1.5">
          <div className="h-1 w-4 rounded-full bg-foreground/25" />
          <div className="h-1 w-5 rounded-full bg-muted-foreground/25" />
          <div className="h-1 w-4 rounded-full bg-muted-foreground/25" />
        </div>

        {/* Player column: top bar / [viz] / content+panel / [viz] / player bar */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="h-2.5 shrink-0 rounded-md bg-muted/25" />
          {visualizerOnTop && visualizerMock}
          <div className="flex min-h-0 flex-1 gap-1.5">
            {sidePanelOnLeft && sidePanelMock}
            <div className="min-w-0 flex-1 rounded-md border border-border/25 bg-muted/15" />
            {sidePanelOnRight && sidePanelMock}
          </div>
          {visualizerOnBottom && visualizerMock}
          <div className="flex h-3.5 shrink-0 items-center justify-center gap-1 rounded-md bg-muted/25">
            <div className="size-1.5 rounded-full bg-foreground/30" />
            <div className="h-1 w-16 rounded-full bg-muted-foreground/30" />
          </div>
        </div>
      </PreviewFrame>
    </SettingsPreview>
  );
}
