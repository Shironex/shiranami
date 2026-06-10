/**
 * Move the item at `from` to index `to`, returning a new array (the input is
 * not mutated). Negative `to` counts from the end, matching `Array#splice`.
 *
 * Semantics are identical to `@dnd-kit/sortable`'s `arrayMove` — kept as a tiny
 * local helper so the sidebar reorder action doesn't drag the entire @dnd-kit
 * tree into the eager bundle (the drag-UI components keep their lazy dnd-kit
 * imports). Out-of-range `from`/`to` behave exactly as `splice` would.
 */
export function arrayMove<T>(array: readonly T[], from: number, to: number): T[] {
  const next = array.slice();
  next.splice(to < 0 ? next.length + to : to, 0, next.splice(from, 1)[0]!);
  return next;
}
