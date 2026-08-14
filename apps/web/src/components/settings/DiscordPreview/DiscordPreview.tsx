import { Music2 } from 'lucide-react';
import { PreviewFrame } from '@/components/settings/PreviewFrame';
import { useDiscordPreview } from './DiscordPreview.hooks';
import type { IDiscordPreviewProps } from './DiscordPreview.types';

/** Discord-style presence preview card, adapted for the music now-playing context. */
export default function DiscordPreview({
  details,
  state,
  showTimestamp,
  showLargeImage,
  showButton,
}: IDiscordPreviewProps) {
  const { t } = useDiscordPreview();

  return (
    <PreviewFrame size="none">
      <div className="rounded-lg bg-[#2b2d31] p-3 font-sans text-white/90">
        <p className="mb-2 text-[10px] font-semibold uppercase text-white/60">
          {t('dsc.preview.playingHeader')}
        </p>
        <div className="flex gap-3">
          {showLargeImage && (
            <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#1e1f22]">
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/30 to-primary/5">
                <Music2 className="h-6 w-6 text-white/70" />
              </div>
            </div>
          )}

          <div className="flex min-w-0 flex-col justify-center gap-0.5">
            <p className="truncate text-xs font-semibold text-white">Shiranami</p>
            {details && <p className="truncate text-xs text-white/70">{details}</p>}
            {state && <p className="truncate text-xs text-white/70">{state}</p>}
            {showTimestamp && <p className="text-xs text-white/50">{t('dsc.preview.elapsed')}</p>}
          </div>
        </div>

        {showButton && (
          <div className="mt-2">
            <div className="w-full rounded bg-[#4e505899] py-1.5 text-center text-xs font-medium text-white/80">
              {t('dsc.preview.landingButton')}
            </div>
          </div>
        )}
      </div>
    </PreviewFrame>
  );
}
