import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { UNKNOWN_ARTIST, UNKNOWN_ALBUM } from '@shiranami/shared';
import { IS_ELECTRON } from '@/lib/platform';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useMetadataEnrichStore } from '@/stores/useMetadataEnrichStore';
import type { IMetadataEnrichSectionView } from './MetadataEnrichSection.types';

/**
 * Owns all bulk-metadata-enrichment logic for the section shell: library
 * counts, run options, the gated write-to-file confirmation, and focus
 * management for the inline confirm. The shell stays a thin presentation layer.
 */
export function useMetadataEnrichSection(): IMetadataEnrichSectionView {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const library = useLibraryStore(s => s.library);
  const isEnriching = useMetadataEnrichStore(s => s.isEnriching);
  const startEnrichment = useMetadataEnrichStore(s => s.startEnrichment);
  const skippedIds = useMetadataEnrichStore(s => s.skippedIds);
  const loadSkipped = useMetadataEnrichStore(s => s.loadSkipped);
  const cancelEnrichment = useMetadataEnrichStore(s => s.cancelEnrichment);
  const isCancelling = useMetadataEnrichStore(s => s.isCancelling);

  const enrichButtonRef = useRef<HTMLButtonElement>(null);
  const confirmYesRef = useRef<HTMLButtonElement>(null);

  const [onlyMissing, setOnlyMissing] = useState(true);
  // Default OFF — writing to files is irreversible, so it must be an explicit opt-in.
  const [writeToFile, setWriteToFile] = useState(false);
  const [includeSkipped, setIncludeSkipped] = useState(false);
  const [confirmWrite, setConfirmWrite] = useState(false);

  // Load persisted skip list on mount
  useEffect(() => {
    loadSkipped();
  }, [loadSkipped]);

  // Count tracks with missing metadata against the DB sentinels (the scanner
  // writes these exact strings). The imported constants are stable module-level
  // references, so the memo dep never rebuilds on locale switches.
  const tracksNeedingEnrichment = useMemo(
    () =>
      library.filter(
        t =>
          t.artist === UNKNOWN_ARTIST ||
          t.album === UNKNOWN_ALBUM ||
          !t.albumArt ||
          !t.genre ||
          !t.year
      ),
    [library]
  );

  // Memoized: skippedCount only changes when the enrichment list or skip set changes,
  // not on every progress tick.
  const skippedCount = useMemo(
    () => tracksNeedingEnrichment.filter(t => skippedIds.has(t.id)).length,
    [tracksNeedingEnrichment, skippedIds]
  );

  const onEnrich = useCallback(() => {
    // Gate destructive path behind inline confirm. Safe path (DB only) runs immediately.
    if (writeToFile) {
      setConfirmWrite(true);
      return;
    }
    startEnrichment({ onlyMissing, writeToFile, includeSkipped });
  }, [startEnrichment, onlyMissing, writeToFile, includeSkipped]);

  const onConfirmedEnrich = useCallback(() => {
    setConfirmWrite(false);
    startEnrichment({ onlyMissing, writeToFile, includeSkipped });
  }, [startEnrichment, onlyMissing, writeToFile, includeSkipped]);

  // If the user flips write-to-file off while the confirm is up, drop the confirm.
  useEffect(() => {
    if (!writeToFile && confirmWrite) setConfirmWrite(false);
  }, [writeToFile, confirmWrite]);

  // Focus the confirm's primary action when it opens; restore focus on dismiss.
  // prevConfirmWrite guards the restore branch so it only runs on a true→false
  // transition, not on initial mount when confirmWrite is already false.
  const prevConfirmWrite = useRef(false);
  useEffect(() => {
    if (confirmWrite) {
      confirmYesRef.current?.focus();
    } else if (prevConfirmWrite.current) {
      enrichButtonRef.current?.focus();
    }
    prevConfirmWrite.current = confirmWrite;
  }, [confirmWrite]);

  const tracksNeedingCount = tracksNeedingEnrichment.length;
  const enrichDisabled = isEnriching || library.length === 0 || tracksNeedingCount === 0;
  const showConfirm = confirmWrite && !isEnriching;

  return {
    t,
    tc,
    isElectron: IS_ELECTRON,

    tracksNeedingCount,
    hasTracksNeeding: tracksNeedingCount > 0,
    skippedCount,
    hasSkipped: skippedCount > 0,

    isEnriching,
    isCancelling,
    showConfirm,
    enrichDisabled,

    onlyMissing,
    onOnlyMissingChange: setOnlyMissing,
    includeSkipped,
    onIncludeSkippedChange: setIncludeSkipped,
    writeToFile,
    onWriteToFileChange: setWriteToFile,

    onEnrich,
    onConfirmedEnrich,
    onDismissConfirm: useCallback(() => setConfirmWrite(false), []),
    onCancel: cancelEnrichment,

    enrichButtonRef,
    confirmYesRef,
  };
}
