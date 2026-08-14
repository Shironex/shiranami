import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { pad2 } from '@shiranami/shared';
import {
  useSleepTimerStore,
  SLEEP_TIMER_PRESETS,
  SLEEP_TIMER_MIN_MINUTES,
  SLEEP_TIMER_MAX_MINUTES,
  type SleepStopMode,
} from '@/stores/useSleepTimerStore';
import type { ISleepTimerPreset, ISleepTimerView } from './SleepTimer.types';

// NOTE: intentionally NOT formatDuration from @shiranami/shared. The sleep
// timer caps at 600 minutes, so `remaining` exceeds an hour; formatDuration
// would render the 90-minute preset as "1:30:00" instead of the "90:00"
// minutes-only format this UI expects. Keep the local mm:ss formatter.
function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${pad2(s)}`;
}

export function useSleepTimer(): ISleepTimerView {
  const { t } = useTranslation('sleepTimer');
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'presets' | 'custom'>('presets');
  const [customValue, setCustomValue] = useState('');
  const [customError, setCustomError] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode !== 'custom') return;
    const el = customInputRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (document.activeElement !== el) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1 : -1;
      setCustomValue(prev => {
        const n = parseInt(prev, 10);
        const base = Number.isNaN(n) ? 0 : n;
        return String(
          Math.min(SLEEP_TIMER_MAX_MINUTES, Math.max(SLEEP_TIMER_MIN_MINUTES, base + delta))
        );
      });
      setCustomError(false);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [mode]);

  const endTime = useSleepTimerStore(s => s.endTime);
  const remaining = useSleepTimerStore(s => s.remaining);
  const windDown = useSleepTimerStore(s => s.windDown);
  const stopMode = useSleepTimerStore(s => s.stopMode);
  const start = useSleepTimerStore(s => s.start);
  const startWindDown = useSleepTimerStore(s => s.startWindDown);
  const startStopAfter = useSleepTimerStore(s => s.startStopAfter);
  const cancel = useSleepTimerStore(s => s.cancel);

  const isActive = endTime !== null || stopMode !== null;
  const isWindDown = endTime !== null && windDown;

  const onOpenChange = useCallback((next: boolean) => {
    if (next) {
      setMode('presets');
      setCustomValue('');
      setCustomError(false);
    }
    setOpen(next);
  }, []);

  const onSelectPreset = useCallback(
    (minutes: number) => {
      start(minutes);
      setOpen(false);
    },
    [start]
  );

  const onSelectWindDown = useCallback(() => {
    startWindDown();
    setOpen(false);
  }, [startWindDown]);

  const onSelectStopAfter = useCallback(
    (mode: SleepStopMode) => {
      startStopAfter(mode);
      setOpen(false);
    },
    [startStopAfter]
  );

  const onCancel = useCallback(() => {
    cancel();
    setOpen(false);
  }, [cancel]);

  const onShowCustom = useCallback(() => {
    setMode('custom');
    setCustomError(false);
    setCustomValue('');
  }, []);

  const onShowPresets = useCallback(() => {
    setMode('presets');
    setCustomError(false);
    setCustomValue('');
  }, []);

  const onCustomChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomValue(e.target.value);
    setCustomError(false);
  }, []);

  const onCustomSubmit = useCallback(() => {
    // Number() + isInteger rejects partial/decimal input ("12abc", "12.5", "")
    // that parseInt would silently accept.
    const parsed = Number(customValue);
    if (
      !Number.isInteger(parsed) ||
      parsed < SLEEP_TIMER_MIN_MINUTES ||
      parsed > SLEEP_TIMER_MAX_MINUTES
    ) {
      setCustomError(true);
      return;
    }
    start(parsed);
    setOpen(false);
  }, [customValue, start]);

  const onCustomKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') onCustomSubmit();
    },
    [onCustomSubmit]
  );

  const presets = useMemo<ISleepTimerPreset[]>(
    () =>
      SLEEP_TIMER_PRESETS.map(minutes => ({ minutes, label: t('minutes', { count: minutes }) })),
    [t]
  );

  const remainingLabel = formatRemaining(remaining);

  // A boundary stop has no countdown — its label doubles as the tooltip.
  const stopModeLabel = stopMode
    ? t(stopMode === 'track' ? 'stopAtTrackEnd' : 'stopAtAlbumEnd')
    : null;

  const tooltipText = stopModeLabel
    ? stopModeLabel
    : isActive
      ? isWindDown
        ? t('windDownIn', { time: remainingLabel })
        : t('sleepIn', { time: remainingLabel })
      : t('label');

  return {
    t,
    open,
    mode,
    customValue,
    customError,
    customInputRef,
    isActive,
    isWindDown,
    stopModeLabel,
    remainingLabel,
    tooltipText,
    triggerLabel: t('label'),
    presets,
    minMinutes: SLEEP_TIMER_MIN_MINUTES,
    maxMinutes: SLEEP_TIMER_MAX_MINUTES,
    onOpenChange,
    onSelectPreset,
    onSelectWindDown,
    onSelectStopAfter,
    onCancel,
    onShowCustom,
    onShowPresets,
    onCustomChange,
    onCustomKeyDown,
    onCustomSubmit,
  };
}
