import type { useTranslation } from 'react-i18next';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/**
 * Where one entry's "get this track" action has got to.
 *
 * `searching` covers the YouTube lookup that turns a station's title into
 * something downloadable; `queued` means it reached the download queue, which
 * owns every stage after that and reports them itself.
 */
export type RadioDiaryFetchStatus = 'idle' | 'searching' | 'queued' | 'error';

export interface IRadioDiaryProps {
  /**
   * The station whose diary this is, or `null` when no station is playing —
   * there is nothing to log against, and the panel says so rather than showing
   * the last station's titles under no name.
   */
  readonly stationUuid: string | null;
  /** The station's display name, for the panel header. */
  readonly stationName: string | null;
  /** Close the panel. */
  readonly onClose: () => void;
}

export interface IRadioDiaryEntryView {
  /** Row id, and the React key. */
  readonly id: number;
  /**
   * The `StreamTitle` the station sent, NFKC-folded for display.
   *
   * Never the derived artist/title: the split is a guess, and the user has to
   * be able to see — and act on — what actually came over the air when the
   * guess is wrong.
   *
   * The fold is the same one the player's title line applies (`fold` in
   * `useRadioNowPlaying`), and it is applied here rather than to the stored row
   * because it is lossy — the raw string stays the source of truth for
   * matching, logging and scrobbling. What it buys is that a station
   * broadcasting `𝕹𝖔𝖜 𝕻𝖑𝖆𝖞𝖎𝖓𝖌` renders the same way in this panel as it does in
   * the player sitting next to it, in a font that can actually draw it.
   */
  readonly titleLabel: string;
  /** Localized clock time the title was heard. */
  readonly timeLabel: string;
  /** Full localized instant, for the row's tooltip. */
  readonly timestampLabel: string;
  /** Where this entry's download action has got to. */
  readonly status: RadioDiaryFetchStatus;
  /** Localized aria-label for the download action, naming the title. */
  readonly actionLabel: string;
  /** Look this title up and hand it to the download queue. */
  readonly onGetTrack: () => void;
}

export interface IRadioDiaryView {
  /** `radio` namespace translator. */
  readonly t: TranslateFn;
  /** The station's entries, newest first. */
  readonly entries: IRadioDiaryEntryView[];
  /** Whether the first read for this station is still in flight. */
  readonly isLoading: boolean;
  /** The station name for the header, or empty when nothing is playing. */
  readonly stationLabel: string;
  /** Whether a station is playing at all — the panel's only real state split. */
  readonly hasStation: boolean;
  /** Whether the read finished and found nothing yet. */
  readonly isEmpty: boolean;
  /** Close the panel. */
  readonly onClose: () => void;
}
