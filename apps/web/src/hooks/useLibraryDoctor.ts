import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { DoctorProgress, DoctorScanResult } from '@shiranami/contracts';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { IS_ELECTRON } from '@/lib/platform';
import { isRadioTrack } from '@/lib/utils';
import { logger } from '@/lib/logger';

interface LibraryDoctorState {
  running: boolean;
  current: number;
  total: number;
  trackName: string;
}

const IDLE: LibraryDoctorState = { running: false, current: 0, total: 0, trackName: '' };

/**
 * Drives a Library Doctor health check (F8) via the main process: every
 * non-radio library file is decoded once and the decode-truth findings —
 * truncation, damaged packets, duration lies, clipping, silence — come back
 * as a report. Findings are informative; nothing is fixed or deleted. The
 * report lives in this hook's state for the session, not in any store: it is
 * a snapshot of the disk at scan time, and persisting it would let it lie.
 */
export function useLibraryDoctor() {
  const [state, setState] = useState<LibraryDoctorState>(IDLE);
  const [report, setReport] = useState<DoctorScanResult | null>(null);
  const runningRef = useRef(false);
  const { t: tToast } = useTranslation('toast');

  useEffect(() => {
    // Feature-detected: `doctor` is a v2-only optional member of the shared
    // preload contract, absent under a v1 preload.
    const doctor = IS_ELECTRON ? window.electronAPI.doctor : undefined;
    if (!doctor) return;
    const unsub = doctor.onProgress((data: DoctorProgress) => {
      setState(prev => ({
        ...prev,
        current: data.current,
        total: data.total,
        trackName: data.trackName,
      }));
    });
    return unsub;
  }, []);

  const start = useCallback(async () => {
    const doctor = IS_ELECTRON ? window.electronAPI.doctor : undefined;
    if (!doctor || runningRef.current) return;

    const input = useLibraryStore
      .getState()
      .library.filter(track => !isRadioTrack(track.filePath))
      .map(track => ({
        id: track.id,
        filePath: track.filePath,
        title: track.title,
        duration: track.duration || null,
      }));
    if (input.length === 0) return;

    runningRef.current = true;
    setReport(null);
    setState({ running: true, current: 0, total: input.length, trackName: '' });
    try {
      setReport(await doctor.scan(input));
    } catch (err) {
      logger.error('Library health check failed', err);
      toast.error(tToast('doctorScanFailed'), { id: 'doctor-scan-error' });
    } finally {
      runningRef.current = false;
      setState(IDLE);
    }
  }, [tToast]);

  const cancel = useCallback(() => {
    const doctor = IS_ELECTRON ? window.electronAPI.doctor : undefined;
    if (!doctor) return;
    void doctor.cancel();
  }, []);

  return { ...state, report, start, cancel };
}
