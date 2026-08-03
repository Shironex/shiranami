import i18n from '@/lib/i18n';

/**
 * Format a minute total as "14h 32m" / "32m". Returns the parts so the
 * renderer can style the units (`h`/`m`) smaller, mirroring the mockup's
 * `<span>` unit treatment.
 */
export function formatHoursMinutes(totalMinutes: number): { hours: number; minutes: number } {
  const safe = Math.max(0, Math.round(totalMinutes));
  return { hours: Math.floor(safe / 60), minutes: safe % 60 };
}

/**
 * Humanized listening duration ("1 hour and 4 minutes" / "1 godzina i 4
 * minuty") rather than a flat "64 minutes", leaning on i18next plurals for
 * both units so PL forms (godzina/godziny/godzin, minuta/minuty/minut)
 * resolve correctly. Lives in `@/lib` (not `overviewUtils`) because both the
 * Overview greeting and the shared weekly-recap card narrate durations.
 */
export function formatListeningDuration(totalMinutes: number): string {
  const { hours, minutes } = formatHoursMinutes(totalMinutes);
  const minutesLabel = i18n.t('session.minutes', { ns: 'overview', count: minutes });
  if (hours <= 0) return minutesLabel;

  const hoursLabel = i18n.t('session.hours', { ns: 'overview', count: hours });
  if (minutes === 0) return hoursLabel;

  return i18n.t('session.hoursAndMinutes', {
    ns: 'overview',
    hours: hoursLabel,
    minutes: minutesLabel,
  });
}
