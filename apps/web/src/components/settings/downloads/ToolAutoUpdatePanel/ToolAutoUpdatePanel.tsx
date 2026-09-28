import { SettingsToggleRow } from '@/components/settings/SettingsCard';
import { useToolAutoUpdatePanel } from './ToolAutoUpdatePanel.hooks';
import type { IToolAutoUpdatePanelProps } from './ToolAutoUpdatePanel.types';

export default function ToolAutoUpdatePanel(props: IToolAutoUpdatePanelProps) {
  const { label, description, checked, disabled, onCheckedChange, rows } =
    useToolAutoUpdatePanel(props);

  const rowEls = rows.map(row => (
    <li key={row.tool} className="text-xs">
      <span className="font-medium text-foreground">{row.tool}</span>
      {row.updatedText && <span className="text-muted-foreground"> · {row.updatedText}</span>}
      <span className="block text-[11px] text-muted-foreground/70">{row.checkedText}</span>
    </li>
  ));

  return (
    <div className="space-y-2">
      <SettingsToggleRow
        label={label}
        description={description}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />

      {rows.length > 0 && (
        <ul className="px-3 py-2 rounded-xl bg-background/50 border border-border/20 space-y-1.5">
          {rowEls}
        </ul>
      )}
    </div>
  );
}
