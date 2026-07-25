import type { ISummaryRowProps, ISummaryRowView } from './SummaryRow.types';

/**
 * SummaryRow is a read-only recap line — no state, no effects, no store reads.
 * The hook forwards its visual props and resolves the optional `highlight`
 * default into a plain flag so the shell stays a thin, logic-free renderer.
 */
export function useSummaryRow({
  icon,
  label,
  value,
  highlight = false,
}: ISummaryRowProps): ISummaryRowView {
  return { icon, label, value, isHighlighted: highlight };
}
