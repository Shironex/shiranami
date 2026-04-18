# IPC payload schemas

Runtime zod validation for every `ipcMain.handle` channel exposed to the
renderer. This is a defence-in-depth layer complementing the preload allow-list
— the allow-list decides which channels are reachable, the schemas decide what
payload shapes each channel accepts.

## Conventions

- **One file per domain.** `shell.ts` for `shell:*` channels, `library.ts` for
  `library:*`, etc. Co-located schemas keep each file small and reviewable.
- **Tuple-per-channel.** Electron forwards positional args as a rest array, so
  each channel's schema is a `z.tuple([...])` matching its parameter list.
- **Zero-arg channels use `z.tuple([])`.** Keeps the validation call site
  uniform (`handle('foo', fn, { schema: fooArgs })`).
- **Export naming.** `<channelVerb>Args` — e.g. `showInFolderArgs`,
  `addTrackArgs`. Predictable, greppable.
- **Desktop-local.** These schemas live here, not in `@shiranami/shared`. The
  shared package stays runtime-dep-free on purpose; only the Electron main
  process needs the zod runtime.
- **Wire to handlers via `handle(channel, fn, { schema })`** — both `handle()`
  and `handleWithFallback()` accept the `{ schema }` options bag. Validation
  failures throw `IpcError('BAD_REQUEST', …, issues)` and bypass any fallback.
