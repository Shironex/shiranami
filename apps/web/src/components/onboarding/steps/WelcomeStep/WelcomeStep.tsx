import { Trans } from 'react-i18next';
import { cn } from '@/lib/utils';
import { OnboardingStepLayout } from '../../OnboardingStepLayout';
import { useWelcomeStep } from './WelcomeStep.hooks';

export default function WelcomeStep() {
  const { t, stepContext, stepMarker, mascotAlt, languageOptions, onSelectLanguage } =
    useWelcomeStep();

  // Build the language pills above the return so the `.map` stays out of JSX
  // render position (declarative-JSX rule).
  const languageButtons = languageOptions.map(lang => (
    <button
      key={lang.code}
      type="button"
      aria-pressed={lang.isActive}
      onClick={() => onSelectLanguage(lang.code)}
      className={cn(
        'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        lang.isActive
          ? 'border border-primary/40 bg-primary/15 text-primary'
          : 'border border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      )}
    >
      {lang.label}
    </button>
  ));

  return (
    <OnboardingStepLayout
      kanji={stepContext.kanji}
      headingId={stepContext.headingId}
      headingRef={stepContext.headingRef}
      stepMarker={stepMarker}
      headline={
        <Trans
          t={t}
          i18nKey="welcome.headline"
          components={{ 1: <em className="not-italic text-primary" /> }}
        />
      }
      description={t('welcome.description')}
    >
      <div className="flex flex-col items-center gap-6 py-2 text-center">
        {/* Brand ring — breathing mascot, dropped under reduced-motion */}
        <div className="relative grid h-32 w-32 place-items-center">
          <span
            aria-hidden="true"
            className="float-mascot absolute inset-0 rounded-full"
            style={{
              background:
                'radial-gradient(circle, oklch(from var(--primary) l c h / 0.22), transparent 70%)',
            }}
          />
          <span
            aria-hidden="true"
            className="absolute inset-2 rounded-full border border-primary/30"
          />
          <img
            src="./mascot.png"
            alt={mascotAlt}
            className="relative h-20 w-20 object-contain"
            draggable={false}
          />
        </div>

        <div className="flex flex-col items-center gap-1">
          <h3 className="m-0 font-serif text-3xl italic leading-none tracking-[-0.015em] text-foreground">
            Shira<em className="not-italic text-primary">nami</em>
          </h3>
          <span
            className="select-none text-sm tracking-[0.05em] text-primary"
            style={{ fontFamily: "'Shippori Mincho', 'Noto Sans JP', 'Hiragino Sans', serif" }}
          >
            白波
          </span>
        </div>

        {/* Language switch */}
        <div className="flex w-full flex-col items-center gap-2 border-t border-border/30 pt-5">
          <p className="text-xs font-medium text-foreground">{t('welcome.language.label')}</p>
          <div className="flex items-center gap-1.5">{languageButtons}</div>
          <p className="max-w-[18rem] text-[11px] leading-snug text-muted-foreground/70">
            {t('welcome.language.hint')}
          </p>
        </div>
      </div>
    </OnboardingStepLayout>
  );
}
