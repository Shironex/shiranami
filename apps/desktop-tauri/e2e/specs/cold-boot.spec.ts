/**
 * The genuine first run — the only scenario in the suite that sees the wizard.
 *
 * # Why this capability drops the E2E flag
 *
 * `App.tsx` seeds `onboardingDone` with `onboardingCompleted || IS_E2E`, so
 * under `SHIRANAMI_E2E=1` the wizard is suppressed on purpose and every other
 * spec lands straight on the shell. That suppression is v1's choice, kept — and
 * it means the *only* way to observe a real cold boot is to not set the flag.
 *
 * The cost is the store registry: `main.tsx` imports `e2e-bridge` only when
 * `electronAPI.__e2e` is true, so `window.__shiranami` does not exist here.
 * Everything below is therefore DOM and IPC, never a store handle — which is
 * also closer to what a first-time user's session actually is.
 *
 * # Ordering inside this file is load-bearing
 *
 * Completing the wizard is a one-way door: it writes `app.onboardingCompleted`
 * and the dialog never returns for the life of the profile. The completion test
 * is therefore last, and everything that needs a live wizard runs before it.
 */

import { browser } from '@wdio/globals';

import { waitForBridge, waitForShell } from '../helpers/app.js';
import { profile, settingsValue } from '../helpers/profile.js';
import { waitForLogLine } from '../helpers/logs.js';

const HOME = profile('onboarding').home;

/** The wizard shell. Role plus modality, never the accessible name — it is i18n. */
const WIZARD = 'div[role="dialog"][aria-modal="true"]';

/**
 * The primary button, selected by position rather than by label.
 *
 * `OnboardingWizard.hooks.ts` gives it three different captions — "Next",
 * "Skip for now" on the folders step when nothing is configured, and "Open
 * library" on the last one — before translation is even considered.
 */
const NEXT = `${WIZARD} footer button:last-of-type`;

/** The only direct `<button>` child of the dialog. */
const SKIP = `${WIZARD} > button`;

/** Which step is showing. The dot's label ends in the raw step id in every locale. */
async function currentStep(): Promise<string> {
  return browser.execute(selector => {
    const active = document.querySelector(`${selector} [role="group"] button[aria-current="step"]`);
    const label = active?.getAttribute('aria-label') ?? '';
    return label.slice(label.lastIndexOf(':') + 1).trim();
  }, WIZARD);
}

describe('cold boot', () => {
  before(async () => {
    await waitForBridge();
  });

  it('shows the first-run wizard on an empty profile', async () => {
    const wizard = await browser.$(WIZARD);
    await wizard.waitForExist({
      timeout: 60_000,
      timeoutMsg: 'the first-run wizard never appeared on a cold profile',
    });

    // The shell must *not* be behind it yet.
    expect(await (await browser.$('#app-sidebar')).isExisting()).toBe(false);
  });

  it('runs without the E2E store registry', async () => {
    // The inverse of `smoke.spec.ts`'s assertion, and the thing that makes this
    // capability's isolation real rather than nominal: a registry present here
    // would mean `SHIRANAMI_E2E` had leaked in and the wizard we are looking at
    // is not the one a user sees.
    const flags = await browser.execute(() => ({
      bridge: 'electronAPI' in window,
      e2e: window.electronAPI.__e2e,
      registry: '__shiranami' in window,
    }));

    expect(flags.bridge).toBe(true);
    expect(flags.e2e).toBe(false);
    expect(flags.registry).toBe(false);
  });

  it('opens on the welcome step with a heading', async () => {
    expect(await currentStep()).toBe('welcome');

    const heading = await browser.$('#onboarding-step-heading');
    expect(await heading.isExisting()).toBe(true);
    expect((await heading.getText()).trim().length).toBeGreaterThan(0);
  });

  it('offers both languages and marks the active one', async () => {
    // `SUPPORTED_LANGUAGES` hardcodes these two captions rather than translating
    // them — a language picker that renamed itself into a language you cannot
    // read would be a poor picker — so matching on the text is safe here in a
    // way it is nowhere else in this file.
    const english = await browser.$(`${WIZARD} button[aria-pressed]=English`);
    const polish = await browser.$(`${WIZARD} button[aria-pressed]=Polski`);

    expect(await english.isExisting()).toBe(true);
    expect(await polish.isExisting()).toBe(true);
    expect(await english.getAttribute('aria-pressed')).toBe('true');
    expect(await polish.getAttribute('aria-pressed')).toBe('false');
  });

  it('switches language and persists the choice', async () => {
    const heading = await browser.$('#onboarding-step-heading');
    const before = await heading.getText();

    await (await browser.$(`${WIZARD} button[aria-pressed]=Polski`)).click();

    await browser.waitUntil(
      async () =>
        (await (
          await browser.$(`${WIZARD} button[aria-pressed]=Polski`)
        ).getAttribute('aria-pressed')) === 'true',
      { timeout: 10_000, timeoutMsg: 'the Polish pill never became the pressed one' }
    );

    // The visible copy has to actually change — a picker that only moves its own
    // highlight is the failure this guards.
    await browser.waitUntil(
      async () => (await (await browser.$('#onboarding-step-heading')).getText()) !== before,
      { timeout: 10_000, timeoutMsg: 'the step heading did not re-render in Polish' }
    );

    await browser.waitUntil(() => settingsValue(HOME, 'app.language') === 'pl', {
      timeout: 10_000,
      timeoutMsg: 'app.language never reached config.json',
    });

    // Back to English so the remaining assertions read the copy they expect.
    await (await browser.$(`${WIZARD} button[aria-pressed]=English`)).click();
    await browser.waitUntil(
      async () => (await (await browser.$('#onboarding-step-heading')).getText()) === before,
      { timeout: 10_000, timeoutMsg: 'the heading did not return to English' }
    );
  });

  it('advances to the next step', async () => {
    await (await browser.$(NEXT)).click();

    await browser.waitUntil(async () => (await currentStep()) === 'folders', {
      timeout: 10_000,
      timeoutMsg: 'Next did not advance from welcome to folders',
    });
  });

  it('completes on skip and lands on the app shell', async () => {
    await (await browser.$(SKIP)).click();

    // The exit is a 520ms fade before `onComplete` fires, so the dialog's
    // disappearance is waited for rather than asserted.
    await (
      await browser.$(WIZARD)
    ).waitForExist({
      reverse: true,
      timeout: 20_000,
      timeoutMsg: 'the wizard never closed after Skip',
    });

    await waitForShell();

    await browser.waitUntil(() => settingsValue(HOME, 'app.onboardingCompleted') === true, {
      timeout: 15_000,
      timeoutMsg: 'app.onboardingCompleted was never persisted',
    });
  });

  it('does not show the wizard again after a reload', async () => {
    await browser.execute(() => {
      window.location.reload();
    });

    await waitForBridge();
    await waitForShell();

    expect(await (await browser.$(WIZARD)).isExisting()).toBe(false);
  });

  it('logged a cold boot against the isolated profile', async () => {
    const line = await waitForLogLine(HOME, 'shiranami starting');
    expect(line).toContain(`data_dir=${HOME}`);
    // The counterpart to `smoke.spec.ts`, which asserts `e2e=true` on the same
    // line. Between them the flag is pinned in both directions.
    expect(line).toContain('e2e=false');
  });
});
