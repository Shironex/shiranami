import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';

interface SettingsHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
}

export function SettingsHeader({ icon, title, subtitle }: SettingsHeaderProps) {
  return <PageHeader variant="section" icon={icon} title={title} subtitle={subtitle} />;
}
