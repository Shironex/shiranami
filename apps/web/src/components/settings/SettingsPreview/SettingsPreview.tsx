import { useSettingsPreview } from './SettingsPreview.hooks';
import type { ISettingsPreviewProps } from './SettingsPreview.types';

export default function SettingsPreview(props: ISettingsPreviewProps) {
  const { title, children } = useSettingsPreview(props);

  return (
    <div className="px-3">
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground/60 mb-2">
        {title}
      </p>
      {children}
    </div>
  );
}
