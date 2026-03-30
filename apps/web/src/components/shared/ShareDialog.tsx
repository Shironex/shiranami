import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Share2, Copy, Check, Loader2, AlertCircle } from 'lucide-react';
import { IS_ELECTRON } from '@/lib/platform';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'track' | 'playlist';
  id: string;
}

export function ShareDialog({ open, onOpenChange, type, id }: ShareDialogProps) {
  const { t } = useTranslation('share');
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [shareUrl, setShareUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !IS_ELECTRON) return;

    let cancelled = false;

    setState('loading');
    setError('');
    setCopied(false);

    const shareFn = type === 'track'
      ? window.electronAPI.share.track(id)
      : window.electronAPI.share.playlist(id);

    shareFn
      .then((result) => {
        if (cancelled) return;
        setShareUrl(result.url);
        setExpiresAt(new Date(result.expiresAt));
        setState('success');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message ?? t('shareError'));
        setState('error');
      });

    return () => { cancelled = true; };
  }, [open, type, id, t]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }, [shareUrl]);

  const minutesLeft = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 60000))
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            {type === 'track' ? t('shareTrack') : t('sharePlaylist')}
          </DialogTitle>
        </DialogHeader>

        {state === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">{t('creating')}</p>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <AlertCircle className="w-6 h-6 text-destructive" />
            <p className="text-sm text-muted-foreground text-center">{error}</p>
          </div>
        )}

        {state === 'success' && (
          <div className="space-y-4 mt-2">
            {/* Share URL + copy */}
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-muted border border-border/50 text-sm text-foreground truncate font-mono">
                {shareUrl}
              </div>
              <button
                onClick={handleCopy}
                className="shrink-0 w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
                aria-label={t('copyLink')}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            {/* QR Code */}
            <div className="flex justify-center">
              <div className="p-4 bg-white rounded-2xl">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(shareUrl)}&bgcolor=ffffff&color=0c0a14`}
                  alt="QR code for sharing"
                  width={180}
                  height={180}
                  className="rounded-lg"
                />
              </div>
            </div>

            {/* Expiry info */}
            <p className="text-center text-xs text-muted-foreground/60">
              {t('expiresIn', { minutes: minutesLeft })}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
