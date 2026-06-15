import { ShieldCheck, Info, Bug, Check, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  SettingsCard,
  SettingsToggleRow,
  SettingsInfoCallout,
} from '@/components/settings/SettingsCard';
import { usePrivacySection } from './PrivacySection.hooks';

export default function PrivacySection() {
  const {
    t,
    enabled,
    performanceEnabled,
    needsRestart,
    sentItems,
    notSentItems,
    showTestCard,
    sentRecently,
    onToggleEnabled,
    onTogglePerformance,
    onSendTestEvent,
  } = usePrivacySection();

  const sentList = sentItems.map(item => <li key={item}>· {item}</li>);
  const notSentList = notSentItems.map(item => <li key={item}>· {item}</li>);

  return (
    <div className="space-y-4">
      <SettingsCard icon={ShieldCheck} title={t('priv.title')} subtitle={t('priv.subtitle')}>
        <SettingsToggleRow
          label={t('priv.toggleLabel')}
          description={t('priv.toggleDesc')}
          checked={enabled}
          onCheckedChange={onToggleEnabled}
        />

        {enabled && (
          <div className="border-t border-border/30 pt-4">
            <SettingsToggleRow
              label={t('priv.perfLabel')}
              description={t('priv.perfDesc')}
              checked={performanceEnabled}
              onCheckedChange={onTogglePerformance}
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 border-t border-border/30 pt-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">{t('priv.sentTitle')}</p>
            <ul className="space-y-1 text-[13px] leading-snug text-muted-foreground">{sentList}</ul>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">{t('priv.notSentTitle')}</p>
            <ul className="space-y-1 text-[13px] leading-snug text-muted-foreground">
              {notSentList}
            </ul>
          </div>
        </div>
      </SettingsCard>

      {needsRestart && (
        <SettingsInfoCallout icon={RotateCcw}>{t('priv.restartNote')}</SettingsInfoCallout>
      )}

      <SettingsInfoCallout icon={Info}>{t('priv.note')}</SettingsInfoCallout>

      {showTestCard && (
        <SettingsCard icon={Bug} title={t('priv.testTitle')} subtitle={t('priv.testDesc')}>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-border/40"
              onClick={onSendTestEvent}
            >
              {sentRecently ? <Check className="h-3.5 w-3.5" /> : <Bug className="h-3.5 w-3.5" />}
              {sentRecently ? t('priv.testSent') : t('priv.testButton')}
            </Button>
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
              {t('priv.testDevOnly')}
            </span>
          </div>
        </SettingsCard>
      )}
    </div>
  );
}
