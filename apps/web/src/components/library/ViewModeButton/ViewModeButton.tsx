import { useViewModeButton } from './ViewModeButton.hooks';
import type { IViewModeButtonProps } from './ViewModeButton.types';

export default function ViewModeButton({
  active,
  onClick,
  icon: Icon,
  label,
}: IViewModeButtonProps) {
  const { className } = useViewModeButton({ active, onClick, icon: Icon, label });

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={className}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
