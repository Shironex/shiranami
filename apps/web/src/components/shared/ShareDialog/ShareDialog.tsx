import { Share2, Copy, Check, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useShareDialog } from './ShareDialog.hooks';
import type { IShareDialogProps } from './ShareDialog.types';

export default function ShareDialog(props: IShareDialogProps) {
  const { open, onOpenChange, type } = props;
  const { t, state, shareUrl, copied, displayError, minutesLeft, qrSrc, generateLink, handleCopy } =
    useShareDialog(props);

  const isLoadingOrIdle = state === 'loading' || state === 'idle';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            {type === 'track' ? t('shareTrack') : t('sharePlaylist')}
          </DialogTitle>
        </DialogHeader>

        {isLoadingOrIdle && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">{t('creating')}</p>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <AlertCircle className="w-6 h-6 text-destructive" />
            <p className="text-sm text-muted-foreground text-center">{displayError}</p>
            <Button size="sm" variant="outline" onClick={generateLink} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              {t('retry')}
            </Button>
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
                className="focus-ring shrink-0 w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
                aria-label={t('copyLink')}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            {/* QR Code */}
            <div className="flex justify-center">
              <div className="p-4 bg-white rounded-2xl">
                <img
                  src={qrSrc}
                  alt="QR code for sharing"
                  width={180}
                  height={180}
                  loading="lazy"
                  decoding="async"
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
