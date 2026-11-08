import type { ComponentType } from 'react';

/** The props a per-icon lucide-react-native import accepts that we use. */
export type IconComponent = ComponentType<{
  size?: number;
  color?: string;
  fill?: string;
  strokeWidth?: number;
}>;
