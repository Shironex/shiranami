import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useShareLink } from '@/hooks/useShareLink';
import type { IShareDialogProps, IShareDialogView } from './ShareDialog.types';

export function useShareDialog({ open, type, id }: IShareDialogProps): IShareDialogView {
  const { t } = useTranslation('share');
  const { state, shareUrl, expiresAt, error, shareTrack, sharePlaylist, reset } = useShareLink();
  const [copied, setCopied] = useState(false);

  const generateLink = useCallback(() => {
    setCopied(false);
    if (type === 'track') {
      void shareTrack(id);
    } else {
      void sharePlaylist(id);
    }
  }, [type, id, shareTrack, sharePlaylist]);

  useEffect(() => {
    if (!open) return;
    generateLink();
    return () => {
      reset();
    };
  }, [open, generateLink, reset]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('copyFailed'));
    }
  }, [shareUrl, t]);

  const displayError = error || t('shareError');

  const minutesLeft = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 60000))
    : 0;

  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(shareUrl)}&bgcolor=ffffff&color=0c0a14`;

  return {
    t,
    state,
    shareUrl,
    copied,
    displayError,
    minutesLeft,
    qrSrc,
    generateLink,
    handleCopy: () => {
      void handleCopy();
    },
  };
}
