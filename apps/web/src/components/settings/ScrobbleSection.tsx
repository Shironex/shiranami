import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Radio, Info, Loader2, Check, X, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { IS_ELECTRON } from '@/lib/platform';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  SettingsCard,
  SettingsInfoCallout,
  SettingsToggleRow,
} from '@/components/settings/SettingsCard';
import type { ScrobbleStatus } from '@shiranami/contracts';

const LISTENBRAINZ_SETTINGS_URL = 'https://listenbrainz.org/settings/';

/**
 * A small "Connected" / "Not connected" pill. External links open via the
 * app's window-open handler (`shell.openExternal`), so `target="_blank"` never
 * navigates the Electron window — see `apps/desktop/src/main/window.ts`.
 */
function StatusPill({ connected, label }: { connected: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
        connected ? 'bg-primary/12 text-primary' : 'bg-muted/40 text-muted-foreground'
      )}
    >
      <span
        className={cn('size-1.5 rounded-full', connected ? 'bg-primary' : 'bg-muted-foreground/50')}
      />
      {label}
    </span>
  );
}

function ProviderHeader({
  name,
  connected,
  statusLabel,
}: {
  name: string;
  connected: boolean;
  statusLabel: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <p className="text-sm font-medium text-foreground">{name}</p>
      <StatusPill connected={connected} label={statusLabel} />
    </div>
  );
}

function ProviderRow({ children }: { children: ReactNode }) {
  return <div className="space-y-2.5 border-t border-border/30 pt-4">{children}</div>;
}

const EMPTY_STATUS: ScrobbleStatus = {
  enabled: false,
  lastfmConnected: false,
  lastfmUsername: null,
  listenBrainzConnected: false,
  pendingCount: 0,
};

/**
 * Opt-in scrobbling settings: connect Last.fm (desktop auth) and/or
 * ListenBrainz (user token), and toggle the master switch. The raw session key
 * / token never leave the main process — this UI only ever sees the
 * {@link ScrobbleStatus} booleans + display name.
 */
export function ScrobbleSection() {
  const { t } = useTranslation('settings');
  const [status, setStatus] = useState<ScrobbleStatus>(EMPTY_STATUS);
  const [lbToken, setLbToken] = useState('');
  const [busy, setBusy] = useState<null | 'lastfm' | 'listenbrainz'>(null);
  // Last.fm desktop auth is a two-step handshake: step 1 opens the browser and
  // mints a token; the user approves there; step 2 exchanges the (now
  // authorized) token for a session key. We hold the pending token between the
  // two clicks — exchanging immediately would always fail (token not yet
  // authorized).
  const [lastfmPendingToken, setLastfmPendingToken] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!IS_ELECTRON) return;
    setStatus(await window.electronAPI.scrobble.getStatus());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleToggle = useCallback(async (enabled: boolean) => {
    if (!IS_ELECTRON) return;
    setStatus(await window.electronAPI.scrobble.setEnabled(enabled));
  }, []);

  // Step 1: open the Last.fm auth page and remember the request token. The user
  // approves access in their browser, then comes back and clicks "Finish".
  const handleBeginLastfm = useCallback(async () => {
    if (!IS_ELECTRON) return;
    setBusy('lastfm');
    try {
      const begun = await window.electronAPI.scrobble.lastfmBeginAuth();
      if (!begun.ok || !begun.token) {
        toast.error(t('scrobbleSettings.lastfmAuthFailed'));
        return;
      }
      setLastfmPendingToken(begun.token);
      toast.info(t('scrobbleSettings.lastfmApprovePrompt'));
    } finally {
      setBusy(null);
    }
  }, [t]);

  // Step 2: exchange the (now-approved) token for a session key.
  const handleFinishLastfm = useCallback(async () => {
    if (!IS_ELECTRON || !lastfmPendingToken) return;
    setBusy('lastfm');
    try {
      const result = await window.electronAPI.scrobble.lastfmCompleteAuth(lastfmPendingToken);
      if (result.ok) {
        toast.success(t('scrobbleSettings.lastfmConnected', { name: result.username ?? '' }));
        setLastfmPendingToken(null);
        await refresh();
      } else {
        toast.error(t('scrobbleSettings.lastfmAuthFailed'));
      }
    } finally {
      setBusy(null);
    }
  }, [lastfmPendingToken, refresh, t]);

  const handleCancelLastfm = useCallback(() => setLastfmPendingToken(null), []);

  const handleDisconnectLastfm = useCallback(async () => {
    if (!IS_ELECTRON) return;
    setStatus(await window.electronAPI.scrobble.lastfmDisconnect());
  }, []);

  const handleConnectListenBrainz = useCallback(async () => {
    if (!IS_ELECTRON) return;
    const token = lbToken.trim();
    if (!token) return;
    setBusy('listenbrainz');
    try {
      const result = await window.electronAPI.scrobble.listenBrainzConnect(token);
      if (result.ok) {
        toast.success(t('scrobbleSettings.listenBrainzConnected', { name: result.username ?? '' }));
        setLbToken('');
        await refresh();
      } else {
        toast.error(t('scrobbleSettings.listenBrainzInvalid'));
      }
    } finally {
      setBusy(null);
    }
  }, [lbToken, refresh, t]);

  const handleDisconnectListenBrainz = useCallback(async () => {
    if (!IS_ELECTRON) return;
    setStatus(await window.electronAPI.scrobble.listenBrainzDisconnect());
  }, []);

  return (
    <div className="space-y-4">
      <SettingsCard
        icon={Radio}
        title={t('scrobbleSettings.title')}
        subtitle={t('scrobbleSettings.subtitle')}
      >
        <SettingsToggleRow
          label={t('scrobbleSettings.toggleLabel')}
          description={t('scrobbleSettings.toggleDesc')}
          checked={status.enabled}
          onCheckedChange={enabled => void handleToggle(enabled)}
        />

        <p className="border-t border-border/30 pt-4 text-xs leading-relaxed text-muted-foreground">
          {t('scrobbleSettings.explainer')}
        </p>

        {/* Last.fm */}
        <ProviderRow>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <ProviderHeader
                name={t('scrobbleSettings.lastfm')}
                connected={status.lastfmConnected}
                statusLabel={
                  status.lastfmConnected
                    ? t('scrobbleSettings.statusConnected')
                    : t('scrobbleSettings.statusNotConnected')
                }
              />
              {status.lastfmConnected && status.lastfmUsername && (
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {t('scrobbleSettings.connectedAs', { name: status.lastfmUsername })}
                </p>
              )}
            </div>
            {status.lastfmConnected ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleDisconnectLastfm()}
                className="shrink-0"
              >
                <X className="size-4" />
                {t('scrobbleSettings.disconnect')}
              </Button>
            ) : lastfmPendingToken ? (
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="ghost" size="sm" onClick={handleCancelLastfm}>
                  {t('scrobbleSettings.cancel')}
                </Button>
                <Button
                  size="sm"
                  onClick={() => void handleFinishLastfm()}
                  disabled={busy === 'lastfm'}
                >
                  {busy === 'lastfm' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  {t('scrobbleSettings.finishConnect')}
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={() => void handleBeginLastfm()}
                disabled={busy === 'lastfm'}
                className="shrink-0"
              >
                {busy === 'lastfm' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ExternalLink className="size-4" />
                )}
                {t('scrobbleSettings.connect')}
              </Button>
            )}
          </div>
          {!status.lastfmConnected && (
            <p className="text-xs leading-relaxed text-muted-foreground/70">
              {lastfmPendingToken
                ? t('scrobbleSettings.lastfmApprovePrompt')
                : t('scrobbleSettings.lastfmHint')}
            </p>
          )}
        </ProviderRow>

        {/* ListenBrainz */}
        <ProviderRow>
          <div className="flex items-center justify-between gap-2">
            <ProviderHeader
              name={t('scrobbleSettings.listenBrainz')}
              connected={status.listenBrainzConnected}
              statusLabel={
                status.listenBrainzConnected
                  ? t('scrobbleSettings.statusConnected')
                  : t('scrobbleSettings.statusNotConnected')
              }
            />
            {status.listenBrainzConnected && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleDisconnectListenBrainz()}
                className="shrink-0"
              >
                <X className="size-4" />
                {t('scrobbleSettings.disconnect')}
              </Button>
            )}
          </div>

          {!status.listenBrainzConnected && (
            <>
              <form
                className="flex items-center gap-2"
                onSubmit={e => {
                  e.preventDefault();
                  void handleConnectListenBrainz();
                }}
              >
                <Input
                  value={lbToken}
                  onChange={e => setLbToken(e.target.value)}
                  placeholder={t('scrobbleSettings.listenBrainzTokenPlaceholder')}
                  aria-label={t('scrobbleSettings.listenBrainzTokenLabel')}
                  type="password"
                  className="flex-1"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={busy === 'listenbrainz' || lbToken.trim().length === 0}
                >
                  {busy === 'listenbrainz' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  {t('scrobbleSettings.connect')}
                </Button>
              </form>
              <p className="text-xs leading-relaxed text-muted-foreground/70">
                <Trans
                  t={t}
                  i18nKey="scrobbleSettings.listenBrainzTokenHint"
                  components={{
                    1: (
                      <a
                        href={LISTENBRAINZ_SETTINGS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
                      />
                    ),
                  }}
                />
              </p>
            </>
          )}
        </ProviderRow>

        {status.pendingCount > 0 && (
          <p className="border-t border-border/30 pt-3 text-xs text-muted-foreground/70">
            {t('scrobbleSettings.pending', { count: status.pendingCount })}
          </p>
        )}
      </SettingsCard>

      <SettingsInfoCallout icon={Info}>{t('scrobbleSettings.note')}</SettingsInfoCallout>
    </div>
  );
}
