import { memo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import ArrowDownToLine from 'lucide-react-native/icons/arrow-down-to-line';
import Check from 'lucide-react-native/icons/check';
import X from 'lucide-react-native/icons/x';
import { ArtTile } from '@/components/art/ArtTile';
import { EqBars } from '@/components/ui/eq-bars';
import { IconButton } from '@/components/ui/icon-button';
import { ListRow, RowMeta } from '@/components/ui/list-row';
import { formatDuration } from '@/lib/format';
import { colors } from '@/lib/theme';
import type { SearchResult } from '@/lib/types';
import { savingLine } from '@/lib/youtube-copy';
import type { SaveJob } from '@/stores/useYouTubeSaveStore';

interface ResultRowProps {
  result: SearchResult;
  /** The playing track is this video. */
  active: boolean;
  playing: boolean;
  /** Asking the server for the audio link before playback starts. */
  loading: boolean;
  saved: boolean;
  job: SaveJob | undefined;
  /** Why the last play of this result failed. */
  playError: string | null;
  onPress: () => void;
  onSave: () => void;
  onCancel: () => void;
}

function metaLine({ result, saved, job, playError }: ResultRowProps): string {
  if (job?.status === 'saving') return savingLine(job.progress);
  if (job?.status === 'failed') return job.error;
  if (playError) return playError;
  return saved ? `${result.uploader} · On this phone` : result.uploader;
}

/** A search result: thumbnail, title, channel, then save to phone (or its progress). */
function ResultRowInner(props: ResultRowProps) {
  const { result, active, playing, loading, saved, job, onPress, onSave, onCancel } = props;
  const saving = job?.status === 'saving';
  return (
    <ListRow
      art={<ArtTile title={result.title} artUri={result.thumbnail || null} />}
      title={result.title}
      meta={metaLine(props)}
      active={active}
      onPress={onPress}
      disabled={loading}
      accessibilityHint={saved ? 'Plays from this phone' : 'Streams through your server'}
      end={
        loading ? (
          <ActivityIndicator size="small" color={colors.mutedForeground} />
        ) : active ? (
          <EqBars playing={playing} />
        ) : (
          <RowMeta>{formatDuration(result.duration)}</RowMeta>
        )
      }
      actions={
        <View>
          {saved ? (
            <IconButton
              icon={Check}
              size={20}
              color={colors.primary}
              disabled
              accessibilityLabel={`${result.title} is saved on this phone`}
            />
          ) : saving ? (
            <IconButton
              icon={X}
              size={20}
              color={colors.foreground}
              accessibilityLabel={`Stop saving ${result.title}`}
              onPress={onCancel}
            />
          ) : (
            <IconButton
              icon={ArrowDownToLine}
              size={20}
              color={colors.mutedForeground}
              accessibilityLabel={`Save ${result.title} to this phone`}
              onPress={onSave}
            />
          )}
        </View>
      }
    />
  );
}

export const ResultRow = memo(ResultRowInner);
