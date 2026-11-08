import { Check, Info, Loader2, QrCode, Smartphone, Trash2, Wifi, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  SettingsCard,
  SettingsInfoCallout,
  SettingsToggleRow,
} from '@/components/settings/SettingsCard';
import { SyncQrCode } from '@/components/settings/SyncQrCode';
import { usePhoneSyncSection } from './PhoneSyncSection.hooks';

/**
 * Settings → System → Sync with phone (LAN sync v0). The listener toggle, the
 * pairing QR with its countdown, Allow / Deny for a phone that scanned it, the
 * listening address and live transfers, and the paired phones with revoke.
 * The QR payload carries a one-time secret, so it is only ever drawn as a
 * code, never printed.
 */
export default function PhoneSyncSection() {
  const {
    t,
    available,
    running,
    busy,
    error,
    listeningLine,
    advertising,
    pairing,
    pendingRows,
    transferLines,
    deviceRows,
    onToggle,
    onStartPairing,
    onCancelPairing,
    onRespond,
    onRevoke,
  } = usePhoneSyncSection();

  if (!available) {
    return (
      <SettingsCard
        icon={Smartphone}
        title={t('phoneSync.title')}
        subtitle={t('phoneSync.subtitle')}
      >
        <SettingsInfoCallout icon={Info}>{t('phoneSync.unavailable')}</SettingsInfoCallout>
      </SettingsCard>
    );
  }

  const pendingList = pendingRows.map(row => (
    <li
      key={row.requestId}
      className="flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/8 px-4 py-3"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{t('phoneSync.wantsToPair')}</p>
        <p className="truncate text-xs text-muted-foreground">{row.label}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRespond(row.requestId, false)}
          disabled={row.busy}
        >
          <X className="size-4" />
          {t('phoneSync.deny')}
        </Button>
        <Button size="sm" onClick={() => onRespond(row.requestId, true)} disabled={row.busy}>
          <Check className="size-4" />
          {t('phoneSync.allow')}
        </Button>
      </div>
    </li>
  ));

  const transferList = transferLines.map(line => (
    <li key={line} className="truncate">
      {line}
    </li>
  ));

  const deviceList = deviceRows.map(row => (
    <li key={row.deviceId} className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <Smartphone className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
          <p className="truncate text-xs text-muted-foreground">{row.detail}</p>
        </div>
      </div>
      <Button
        variant="destructiveGhost"
        size="sm"
        onClick={() => onRevoke(row.deviceId)}
        disabled={row.busy}
        aria-label={t('phoneSync.revokeNamed', { name: row.name })}
        className="shrink-0"
      >
        <Trash2 className="size-4" />
        {t('phoneSync.revoke')}
      </Button>
    </li>
  ));

  const pairingBlock = pairing ? (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border/30 bg-surface/50 p-4 sm:flex-row sm:items-start">
      {pairing.expired ? (
        <div className="flex size-48 items-center justify-center rounded-lg border border-dashed border-border/50 text-xs text-muted-foreground">
          {t('phoneSync.codeExpired')}
        </div>
      ) : (
        <SyncQrCode value={pairing.deepLink} label={t('phoneSync.qrLabel')} />
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-medium text-foreground">{t('phoneSync.scanTitle')}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('phoneSync.scanHint')}</p>
        <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {pairing.countdown}
        </p>
        <div className="flex gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onCancelPairing} disabled={busy === 'pairing'}>
            {t('phoneSync.cancel')}
          </Button>
          {pairing.expired ? (
            <Button size="sm" onClick={onStartPairing} disabled={busy === 'pairing'}>
              {t('phoneSync.newCode')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  ) : (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs leading-relaxed text-muted-foreground">{t('phoneSync.pairHint')}</p>
      <Button size="sm" onClick={onStartPairing} disabled={busy === 'pairing'} className="shrink-0">
        {busy === 'pairing' ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <QrCode className="size-4" />
        )}
        {t('phoneSync.pairPhone')}
      </Button>
    </div>
  );

  const statusBlock = listeningLine ? (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p className="flex items-center gap-2">
        <Wifi className="size-3.5 text-primary" aria-hidden="true" />
        <span className="tabular-nums">{listeningLine}</span>
      </p>
      <p>{advertising ? t('phoneSync.discoverable') : t('phoneSync.notDiscoverable')}</p>
      {transferLines.length > 0 ? <ul className="space-y-0.5 pt-1">{transferList}</ul> : null}
    </div>
  ) : null;

  const devicesBlock =
    deviceRows.length > 0 ? (
      <ul className="divide-y divide-border/30">{deviceList}</ul>
    ) : (
      <p className="text-xs text-muted-foreground">{t('phoneSync.noDevices')}</p>
    );

  return (
    <div className="space-y-4">
      <SettingsCard
        icon={Smartphone}
        title={t('phoneSync.title')}
        subtitle={t('phoneSync.subtitle')}
      >
        <SettingsToggleRow
          label={t('phoneSync.toggleLabel')}
          description={t('phoneSync.toggleDesc')}
          checked={running}
          onCheckedChange={onToggle}
          disabled={busy === 'toggle'}
        />

        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}

        {statusBlock}

        {pendingRows.length > 0 ? <ul className="space-y-2">{pendingList}</ul> : null}

        <div className="border-t border-border/30 pt-4">{pairingBlock}</div>
      </SettingsCard>

      <SettingsCard
        icon={Smartphone}
        title={t('phoneSync.devicesTitle')}
        subtitle={t('phoneSync.devicesSubtitle')}
      >
        {devicesBlock}
      </SettingsCard>
    </div>
  );
}
