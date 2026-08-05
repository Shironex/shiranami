import { cn } from '@/lib/utils';
import { useCompanionSection } from './CompanionSection.hooks';

export default function CompanionSection() {
  const { label } = useCompanionSection();

  return (
    <div className={cn('flex flex-col gap-2')} data-slot="companion-section">
      {label}
    </div>
  );
}
