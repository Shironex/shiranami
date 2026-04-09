import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { Apple, Download, ExternalLink, FileText, Monitor } from 'lucide-react';
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { LandingLanguage } from '@/lib/i18n';
import { GITHUB_RELEASES_API_URL, GITHUB_RELEASES_LATEST_URL } from '@/lib/site';

const ease = [0.16, 1, 0.3, 1] as const;

type Platform = 'mac' | 'win';

interface ReleaseAsset {
  name: string;
  size: number;
  browser_download_url: string;
}

interface ReleaseData {
  tag_name: string;
  name?: string;
  published_at: string;
  html_url: string;
  assets: ReleaseAsset[];
}

interface PlatformInfo {
  key: Platform;
  labelKey: string;
  icon: typeof Apple;
  extension: string;
  pattern: RegExp;
}

const PLATFORMS: PlatformInfo[] = [
  { key: 'mac', labelKey: 'download.macos', icon: Apple, extension: '.dmg', pattern: /\.dmg$/i },
  { key: 'win', labelKey: 'download.windows', icon: Monitor, extension: '.exe', pattern: /\.exe$/i },
];

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'win';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'mac';
  return 'win';
}

function formatBytes(bytes: number, locale: string): string {
  if (bytes < 1024 * 1024) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
      bytes / 1024,
    )} KB`;
  }
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(bytes / (1024 * 1024))} MB`;
}

function formatPublishedDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

const CONFETTI_COLORS = [
  'oklch(0.72 0.12 280)',
  'oklch(0.65 0.15 285)',
  'oklch(0.78 0.13 280)',
  'oklch(0.75 0.12 290)',
  'oklch(0.82 0.10 275)',
];

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  angle: number;
  speed: number;
}

/** Tiny confetti burst — fires particles outward from a click point */
function useConfetti() {
  const [particles, setParticles] = useState<Particle[]>([]);
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const fire = useCallback((event: MouseEvent) => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const batch: Particle[] = Array.from({ length: 14 }, (_, i) => ({
      id: Date.now() + i,
      x: cx,
      y: cy,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
      angle: (i / 14) * 360 + (Math.random() - 0.5) * 30,
      speed: 60 + Math.random() * 40,
    }));
    setParticles(batch);
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setParticles([]), 800);
  }, []);

  const layer = (
    <AnimatePresence>
      {particles.map((p) => {
        const rad = (p.angle * Math.PI) / 180;
        return (
          <motion.div
            key={p.id}
            className="pointer-events-none fixed z-50"
            style={{
              left: p.x,
              top: p.y,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: p.color,
            }}
            initial={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            animate={{
              opacity: 0,
              scale: 0.3,
              x: Math.cos(rad) * p.speed,
              y: Math.sin(rad) * p.speed - 20,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          />
        );
      })}
    </AnimatePresence>
  );

  return { fire, layer };
}

function SkeletonButton({ delay }: { delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease }}
    >
      <div className="flex items-center gap-4 rounded-2xl border border-line bg-card-soft/60 px-6 py-5">
        <div className="h-11 w-11 animate-pulse rounded-xl bg-card-soft" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-20 animate-pulse rounded bg-card-soft" />
          <div className="h-3 w-28 animate-pulse rounded bg-card-soft/60" />
        </div>
      </div>
    </motion.div>
  );
}

interface AssetButtonProps {
  platform: PlatformInfo;
  asset: ReleaseAsset | null;
  releasePageUrl: string;
  isPrimary: boolean;
  delay: number;
  label: string;
  yourSystemLabel: string;
  releasePageLabel: string;
  buildAriaLabel: (args: { platform: string; ext: string; size: string }) => string;
  locale: string;
  onDownload: (event: MouseEvent) => void;
}

function AssetButton({
  platform,
  asset,
  releasePageUrl,
  isPrimary,
  delay,
  label,
  yourSystemLabel,
  releasePageLabel,
  buildAriaLabel,
  locale,
  onDownload,
}: AssetButtonProps) {
  const Icon = platform.icon;

  // Asset missing for this platform — fall back to GitHub release page link instead of
  // hanging on a permanent skeleton (the bug shiroani's version has).
  if (!asset) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay, ease }}
      >
        <a
          href={releasePageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-4 rounded-2xl border border-line bg-card-soft/50 px-6 py-5 transition-colors duration-200 hover:border-line-strong hover:bg-card-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-card-soft">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <span className="text-sm font-semibold text-foreground/80">{label}</span>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {platform.extension} · {releasePageLabel}
            </p>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground/40 transition-colors duration-200 group-hover:text-muted-foreground" />
        </a>
      </motion.div>
    );
  }

  const sizeText = formatBytes(asset.size, locale);
  const ariaLabel = buildAriaLabel({ platform: label, ext: platform.extension, size: sizeText });

  if (isPrimary) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay, ease }}
      >
        <a
          href={asset.browser_download_url}
          onClick={onDownload}
          aria-label={ariaLabel}
          className="group flex items-center gap-4 rounded-2xl border border-primary/30 bg-primary/10 px-6 py-5 transition-colors duration-200 hover:border-primary/45 hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        >
          <motion.div
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/20 transition-colors duration-200 group-hover:bg-primary/25"
            whileHover={{ scale: 1.08, rotate: -3 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          >
            <Icon className="h-5 w-5 text-primary" />
          </motion.div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{label}</span>
              <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                {yourSystemLabel}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {platform.extension} · {sizeText}
            </p>
          </div>
          <Download className="h-4 w-4 text-primary/60 transition-transform duration-200 group-hover:translate-y-0.5 group-hover:text-primary" />
        </a>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease }}
    >
      <a
        href={asset.browser_download_url}
        onClick={onDownload}
        aria-label={ariaLabel}
        className="group flex items-center gap-4 rounded-2xl border border-line bg-card-soft/50 px-6 py-5 transition-colors duration-200 hover:border-line-strong hover:bg-card-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-card-soft transition-colors duration-200 group-hover:bg-card">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <span className="text-sm font-semibold text-foreground/80">{label}</span>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {platform.extension} · {sizeText}
          </p>
        </div>
        <Download className="h-4 w-4 text-muted-foreground/40 transition-transform duration-200 group-hover:translate-y-0.5 group-hover:text-muted-foreground" />
      </a>
    </motion.div>
  );
}

interface DownloadPageProps {
  translations: Record<LandingLanguage, Record<string, string>>;
}

export function DownloadPage({ translations }: DownloadPageProps) {
  const [lang, setLang] = useState<LandingLanguage>('en');

  // Sync with BaseLayout's i18n script. The first paint will use 'en' (matching SSR),
  // then this effect upgrades to whatever BaseLayout decided once it runs.
  useEffect(() => {
    const sync = () => {
      const next: LandingLanguage = document.documentElement.lang === 'pl' ? 'pl' : 'en';
      setLang(next);
    };
    sync();
    document.addEventListener('shiranami:lang-change', sync);
    return () => document.removeEventListener('shiranami:lang-change', sync);
  }, []);

  const t = useCallback(
    (key: string) => translations[lang]?.[key] ?? translations.en?.[key] ?? key,
    [translations, lang],
  );
  const locale = lang === 'pl' ? 'pl-PL' : 'en-US';

  const [release, setRelease] = useState<ReleaseData | null>(null);
  const [error, setError] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [detectedPlatform, setDetectedPlatform] = useState<Platform | null>(null);
  const { fire, layer } = useConfetti();

  // Defer platform detection to a client-only effect so SSR markup matches first client render.
  useEffect(() => {
    setDetectedPlatform(detectPlatform());
  }, []);

  // Fetch the latest release once on mount.
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(GITHUB_RELEASES_API_URL, { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch latest release');
        return res.json() as Promise<ReleaseData>;
      })
      .then(setRelease)
      .catch((err: unknown) => {
        if (!(err instanceof Error) || err.name !== 'AbortError') setError(true);
      });
    return () => ctrl.abort();
  }, []);

  const handleDownload = useCallback(
    (event: MouseEvent) => {
      fire(event);
      setDownloaded(true);
    },
    [fire],
  );

  const version = release?.tag_name?.replace(/^v/i, '') ?? null;

  const assetMap = useMemo(() => {
    const map = new Map<Platform, ReleaseAsset>();
    if (!release) return map;
    for (const platform of PLATFORMS) {
      const asset = release.assets.find((a) => platform.pattern.test(a.name));
      if (asset) map.set(platform.key, asset);
    }
    return map;
  }, [release]);

  const sortedPlatforms = useMemo(() => {
    return [...PLATFORMS].sort((a, b) => {
      if (a.key === detectedPlatform) return -1;
      if (b.key === detectedPlatform) return 1;
      return 0;
    });
  }, [detectedPlatform]);

  const buildAriaLabel = useCallback(
    ({ platform, ext, size }: { platform: string; ext: string; size: string }) =>
      t('download.downloadAria')
        .replace('{platform}', platform)
        .replace('{ext}', ext)
        .replace('{size}', size),
    [t],
  );

  return (
    <MotionConfig reducedMotion="user">
      {layer}

      <div className="relative mx-auto max-w-3xl">
        {/* Background glow */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div
            className="absolute left-1/2 top-16 h-[420px] w-[520px] -translate-x-1/2 rounded-full opacity-[0.10]"
            style={{
              background:
                'radial-gradient(ellipse, oklch(0.72 0.12 280 / 0.35), transparent 70%)',
            }}
          />
        </div>

        {/* Pill */}
        <motion.div
          className="mb-4 flex justify-center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease }}
        >
          <span className="pill">{t('download.pill')}</span>
        </motion.div>

        {/* Mascot + heading */}
        <motion.div
          className="relative mb-12 flex flex-col items-center text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease }}
        >
          <motion.img
            src="/mascot.png"
            alt={t('download.mascotAlt')}
            className="mb-6 h-24 w-24 select-none drop-shadow-[0_0_28px_rgba(168,150,255,0.18)]"
            draggable={false}
            animate={
              downloaded
                ? { y: 0, scale: [1, 1.18, 1], rotate: [0, -10, 10, 0] }
                : { y: [0, -8, 0], scale: 1, rotate: 0 }
            }
            transition={
              downloaded
                ? { duration: 0.7, ease: 'easeOut' }
                : { duration: 5, repeat: Infinity, ease: 'easeInOut' }
            }
          />

          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {downloaded ? t('download.headingAfter') : t('download.heading')}
          </h1>

          <AnimatePresence mode="wait">
            <motion.p
              key={downloaded ? 'after' : 'before'}
              className="mt-3 max-w-md text-muted-foreground"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              {downloaded ? t('download.bodyAfter') : t('download.body')}
            </motion.p>
          </AnimatePresence>

          <div aria-live="polite" className="sr-only">
            {downloaded ? t('download.downloadStartedAnnouncement') : ''}
          </div>

          {version && release && (
            <motion.div
              className="mt-5 flex items-center gap-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
            >
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1">
                <motion.span
                  className="h-1.5 w-1.5 rounded-full bg-primary"
                  animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
                <span className="text-xs font-semibold text-primary">v{version}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {formatPublishedDate(release.published_at, locale)}
              </span>
            </motion.div>
          )}
        </motion.div>

        {/* Download buttons */}
        <div className="relative">
          {error ? (
            <motion.div
              className="rounded-2xl border border-line bg-card-soft/50 p-8 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <p className="text-sm text-muted-foreground">{t('download.fetchFailed')}</p>
              <a
                href={GITHUB_RELEASES_LATEST_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                {t('download.getFromGithub')}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </motion.div>
          ) : (
            <div className="space-y-3">
              {release
                ? sortedPlatforms.map((platform, i) => (
                    <AssetButton
                      key={platform.key}
                      platform={platform}
                      asset={assetMap.get(platform.key) ?? null}
                      releasePageUrl={release.html_url || GITHUB_RELEASES_LATEST_URL}
                      isPrimary={platform.key === detectedPlatform}
                      delay={0.15 + i * 0.08}
                      label={t(platform.labelKey)}
                      yourSystemLabel={t('download.yourSystem')}
                      releasePageLabel={t('download.releasePage')}
                      buildAriaLabel={buildAriaLabel}
                      locale={locale}
                      onDownload={handleDownload}
                    />
                  ))
                : PLATFORMS.map((_, i) => <SkeletonButton key={i} delay={0.15 + i * 0.08} />)}
            </div>
          )}
        </div>

        {/* macOS unsigned notice */}
        {detectedPlatform === 'mac' && (
          <motion.div
            className="mx-auto mt-8 w-full max-w-md rounded-xl border border-line bg-card-soft/60 p-5"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.4 }}
          >
            <p className="mb-1 text-sm font-medium text-foreground/90">
              {t('download.unsignedShortTitle')}
            </p>
            <p className="mb-3 text-xs text-muted-foreground">{t('download.unsignedShortBody')}</p>
            <code className="block rounded-lg bg-background/80 px-4 py-3 font-mono text-xs text-foreground/80 select-all">
              xattr -rd com.apple.quarantine /Applications/Shiranami.app
            </code>
          </motion.div>
        )}

        {/* Links */}
        <motion.div
          className="mt-12 flex flex-wrap items-center justify-center gap-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        >
          <a
            href="/changelog"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          >
            <FileText className="h-3.5 w-3.5" />
            {t('download.changelog')}
          </a>
          {release && (
            <a
              href={release.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t('download.githubRelease')}
            </a>
          )}
        </motion.div>
      </div>
    </MotionConfig>
  );
}
