import type { ICompanionSectionView } from './CompanionSection.types';

export function useCompanionSection(): ICompanionSectionView {
  // TODO: own this component's state, queries, store reads, and IPC calls here
  // so the shell stays presentational.
  return { label: 'CompanionSection' };
}
