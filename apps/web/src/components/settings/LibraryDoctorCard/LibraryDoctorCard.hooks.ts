import { useTranslation } from 'react-i18next';
import type { DoctorFinding, DoctorSeverity } from '@shiranami/contracts';
import { useLibraryDoctor } from '@/hooks/useLibraryDoctor';
import type { IDoctorFindingItem, ILibraryDoctorCardView } from './LibraryDoctorCard.types';

/** Errors first, then warnings, then the merely-informative. */
const SEVERITY_RANK: Record<DoctorSeverity, number> = { error: 0, warning: 1, info: 2 };

/** `93.4` seconds → `"1:33"`. */
function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

export function useLibraryDoctorCard(): ILibraryDoctorCardView {
  const { t } = useTranslation('settings');
  const doctor = useLibraryDoctor();

  const findingLabel = (finding: DoctorFinding): string => {
    switch (finding.kind) {
      case 'missingFile':
        return t('doctor.findingMissingFile');
      case 'unreadable':
        return t('doctor.findingUnreadable');
      case 'noAudio':
        return t('doctor.findingNoAudio');
      case 'unsupportedCodec':
        return t('doctor.findingUnsupportedCodec');
      case 'truncated':
        return t('doctor.findingTruncated');
      case 'damagedPackets':
        return t('doctor.findingDamagedPackets', { count: finding.skippedPackets ?? 0 });
      case 'durationMismatch':
        return t('doctor.findingDurationMismatch', {
          expected: clock(finding.expectedSeconds ?? 0),
          actual: clock(finding.actualSeconds ?? 0),
        });
      case 'clipping':
        return t('doctor.findingClipping', {
          peak: (finding.truePeakDb ?? 0).toFixed(1),
        });
      case 'silent':
        return t('doctor.findingSilent');
    }
  };

  const findings: IDoctorFindingItem[] = (doctor.report?.findings ?? [])
    .map(finding => ({
      key: `${finding.trackId}:${finding.kind}`,
      title: finding.title,
      label: findingLabel(finding),
      filePath: finding.filePath,
      severity: finding.severity,
    }))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  const report = doctor.report;
  const summaryLabel = report
    ? report.cancelled
      ? t('doctor.summaryCancelled', { scanned: report.scanned, count: report.findings.length })
      : report.findings.length === 0
        ? t('doctor.summaryHealthy', { scanned: report.scanned })
        : t('doctor.summaryFindings', { scanned: report.scanned, count: report.findings.length })
    : null;

  return {
    title: t('doctor.title'),
    subtitle: t('doctor.subtitle'),
    idleLabel: t('doctor.idle'),
    running: doctor.running,
    progressLabel: doctor.running
      ? t('doctor.progress', {
          current: doctor.current,
          total: doctor.total,
          track: doctor.trackName,
        })
      : null,
    runLabel: t('doctor.run'),
    cancelLabel: t('doctor.cancel'),
    onRun: () => void doctor.start(),
    onCancel: doctor.cancel,
    summaryLabel,
    allHealthy: report != null && !report.cancelled && report.findings.length === 0,
    findings,
  };
}
