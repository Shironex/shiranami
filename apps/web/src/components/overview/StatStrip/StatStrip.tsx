import { useTranslation } from 'react-i18next';
import { StatTile } from '../StatTile';
import { formatHoursMinutes } from '../overviewUtils';
import { useStatStrip } from './StatStrip.hooks';
import type { IStatStripProps } from './StatStrip.types';

/** "14h 32m" with the unit letters rendered smaller, matching the mockup. */
function HoursMinutes({ minutes }: { readonly minutes: number }) {
  const { t } = useTranslation('overview');
  const { hours, minutes: mins } = formatHoursMinutes(minutes);
  if (hours === 0) {
    return (
      <>
        {mins}
        <span className="ml-0.5 text-base text-muted-foreground/70">{t('minutesUnit')}</span>
      </>
    );
  }
  return (
    <>
      {hours}
      <span className="ml-0.5 text-base text-muted-foreground/70">{t('hoursUnit')}</span> {mins}
      <span className="ml-0.5 text-base text-muted-foreground/70">{t('minutesUnit')}</span>
    </>
  );
}

/** The four-up Overview stat tiles (listened, plays, top artist, new in library). */
export default function StatStrip(props: IStatStripProps) {
  const {
    totalMinutes,
    labels,
    trendHint,
    trendDir,
    tracksPlayed,
    tracksHint,
    topArtistValue,
    topArtistHint,
    newInLibraryValue,
    newInLibraryHint,
  } = useStatStrip(props);

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        kanji="時"
        value={<HoursMinutes minutes={totalMinutes} />}
        label={labels.listenedThisWeek}
        hint={trendHint}
        trend={trendDir}
      />
      <StatTile kanji="曲" value={tracksPlayed} label={labels.tracksPlayed} hint={tracksHint} />
      <StatTile kanji="人" value={topArtistValue} label={labels.topArtist} hint={topArtistHint} />
      <StatTile
        kanji="新"
        value={newInLibraryValue}
        label={labels.newInLibrary}
        hint={newInLibraryHint}
      />
    </section>
  );
}
