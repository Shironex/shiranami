# Data-fetching hooks

Convention for this directory:

- **All IPC data reads** use TanStack Query (`useQuery`) and live in this directory.
- **All IPC mutations** use `useMutation` and are colocated with their related queries in the same file.
- **Query keys** are exported from each file as `<domain>Keys` (e.g. `playlistKeys`, `folderKeys`, `libraryKeys`). Use `as const` for type narrowing.
- **Zustand writes** never happen inside queries/ hooks. Runtime state that must be synced from a query result belongs in a dedicated `useXSync` hook in the flat `hooks/` directory (see `useLibrarySync` for the pattern).
- **Toasts** are not fired from mutations. They belong to the imperative action hook or component that invokes the mutation.
- **`IS_ELECTRON` guard** goes both in `queryFn` (return empty) and `enabled` for queries; mutations can assume Electron.

Hooks that do NOT belong here:

- Event subscriptions (`*.on*` listeners) — flat `hooks/`
- Wizard/multi-step flows that coordinate several mutations with local UI state — flat `hooks/`
- Composition hooks that wrap a query + extra view-layer logic — flat `hooks/`
- UI-only hooks (click-outside, keyboard shortcuts, canvas size, etc.) — flat `hooks/`
