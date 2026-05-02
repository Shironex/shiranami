interface SettingsPreviewProps {
  title: string;
  children: React.ReactNode;
}

export function SettingsPreview({ title, children }: SettingsPreviewProps) {
  return (
    <div className="px-3">
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground/60 mb-2">
        {title}
      </p>
      {children}
    </div>
  );
}
