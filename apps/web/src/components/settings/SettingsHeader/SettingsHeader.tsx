import { PageHeader } from '@/components/shared/PageHeader';
import { useSettingsHeader } from './SettingsHeader.hooks';
import type { ISettingsHeaderProps } from './SettingsHeader.types';

export default function SettingsHeader(props: ISettingsHeaderProps) {
  const { icon, title, subtitle } = useSettingsHeader(props);

  return <PageHeader variant="section" icon={icon} title={title} subtitle={subtitle} />;
}
