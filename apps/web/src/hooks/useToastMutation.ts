import { useCallback } from 'react';
import { toast } from 'sonner';
import i18n from '@/lib/i18n';
import { logger } from '@/lib/logger';

interface ToastMutationOptions<TArgs extends unknown[], TResult> {
  /**
   * The async action to run. Returning `false` (or nothing meaningful) is fine;
   * use `successMessage`'s function form to inspect the resolved result.
   */
  mutate: (...args: TArgs) => Promise<TResult>;
  /**
   * Success toast — a `toast`-namespace i18n key, or a function deriving the
   * message from the result. Omit to skip the success toast.
   */
  successMessage?: string | ((result: TResult) => string);
  /** Error toast — a `toast`-namespace i18n key. Omit to skip the error toast. */
  errorMessage?: string;
  /** Context label prefixed onto the logged error. */
  logLabel?: string;
}

const resolveKey = (key: string) => i18n.t(key, { ns: 'toast' });

/**
 * Run an async action with the standard success/error toast + error-logging
 * skeleton. Returns the result on success, or `undefined` on failure (the
 * error is logged and surfaced via the error toast, not re-thrown).
 *
 * Centralizes the `try { await x; toast.success(t('...')) } catch { logger;
 * toast.error(t('...')) }` pattern repeated across the mutation hooks. Uses the
 * imperative `i18n.t` (correct for fire-and-forget toasts). Migrating the ~6
 * mutation hooks onto it is Phase 3.
 */
export async function withToast<TArgs extends unknown[], TResult>(
  options: ToastMutationOptions<TArgs, TResult>,
  ...args: TArgs
): Promise<TResult | undefined> {
  const { mutate, successMessage, errorMessage, logLabel } = options;
  try {
    const result = await mutate(...args);
    if (successMessage !== undefined) {
      const message =
        typeof successMessage === 'function' ? successMessage(result) : resolveKey(successMessage);
      toast.success(message);
    }
    return result;
  } catch (err) {
    logger.error(logLabel ? `${logLabel}:` : 'Mutation failed:', err);
    if (errorMessage !== undefined) {
      toast.error(resolveKey(errorMessage));
    }
    return undefined;
  }
}

/**
 * Hook form: returns a stable callback that runs `mutate` wrapped in
 * `withToast`. The options object is read on each call, so inline literals are
 * fine without memoization.
 */
export function useToastMutation<TArgs extends unknown[], TResult>(
  options: ToastMutationOptions<TArgs, TResult>
): (...args: TArgs) => Promise<TResult | undefined> {
  const { mutate, successMessage, errorMessage, logLabel } = options;
  return useCallback(
    (...args: TArgs) => withToast({ mutate, successMessage, errorMessage, logLabel }, ...args),
    [mutate, successMessage, errorMessage, logLabel]
  );
}
