import { useToolVersionBlock } from './ToolVersionBlock.hooks';
import type { IToolVersionBlockProps } from './ToolVersionBlock.types';

export default function ToolVersionBlock(props: IToolVersionBlockProps) {
  const { installedVersion, latestVersion, installedVersionLabel, latestReleaseLabel } =
    useToolVersionBlock(props);

  return (
    <div className="px-3 py-2 rounded-xl bg-background/50 border border-border/20 space-y-1.5">
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground">{installedVersionLabel}</p>
        <p className="ml-auto text-xs text-foreground font-mono tabular-nums">{installedVersion}</p>
      </div>
      {latestVersion ? (
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">{latestReleaseLabel}</p>
          <p className="ml-auto text-xs text-foreground font-mono tabular-nums">{latestVersion}</p>
        </div>
      ) : null}
    </div>
  );
}
