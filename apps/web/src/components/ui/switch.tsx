import { motion } from 'motion/react';

interface SwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
}

export function Switch({ checked, onChange }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        backgroundColor: checked ? 'var(--primary)' : 'oklch(0.2 0.02 280)',
      }}
    >
      <motion.span
        className="pointer-events-none block h-5 w-5 rounded-full bg-foreground shadow-sm"
        animate={{ x: checked ? 20 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        style={{ marginTop: 2 }}
      />
    </button>
  );
}
