import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
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
  tagKey: string;
  extension: string;
  pattern: RegExp;
}

const PLATFORMS: PlatformInfo[] = [
  {
    key: 'win',
    labelKey: 'download.windows',
    tagKey: 'download.windowsTag',
    extension: '.exe',
    pattern: /\.exe$/i,
  },
  {
    key: 'mac',
    labelKey: 'download.macos',
    tagKey: 'download.macosTag',
    extension: '.dmg',
    pattern: /\.dmg$/i,
  },
];

const WindowsIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M3 5l8-1v8H3V5zm0 9h8v8l-8-1v-7zm9-10l9-1v10h-9V4zm0 10h9v10l-9-1V14z" />
  </svg>
);

const MacIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16.7 1.6c0 1.4-.5 2.7-1.5 3.8-1.1 1.2-2.4 1.9-3.7 1.8-.2-1.4.5-2.8 1.5-3.8 1-1.1 2.5-1.8 3.7-1.8zm4.2 17.6c-.7 1.6-1.1 2.3-2 3.7-1.3 1.9-3.1 4.3-5.4 4.3-2 0-2.5-1.3-5.2-1.3s-3.3 1.3-5.3 1.3c-2.3 0-4-2.2-5.3-4.1-3.7-5.4-4.1-11.7-1.8-15 1.6-2.4 4.2-3.8 6.6-3.8 2.5 0 4 1.4 6 1.4 1.9 0 3.1-1.4 6-1.4 2.2 0 4.5 1.2 6.1 3.3-5.4 3-4.5 10.7.3 11.6z" />
  </svg>
);

const PlatformIcon = ({ platform }: { platform: Platform }) =>
  platform === 'win' ? <WindowsIcon /> : <MacIcon />;

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'win';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'mac';
  return 'win';
}

function formatBytes(bytes: number, locale: string): string {
  if (bytes < 1024 * 1024) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
      bytes / 1024
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
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}

const CONFETTI_COLORS = [
  'oklch(0.74 0.13 295)',
  'oklch(0.65 0.18 320)',
  'oklch(0.55 0.16 270)',
  'oklch(0.78 0.14 65)',
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
            style={{
              position: 'fixed',
              left: p.x,
              top: p.y,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: p.color,
              pointerEvents: 'none',
              zIndex: 99,
            }}
            initial={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            animate={{
              opacity: 0,
              scale: 0.3,
              x: Math.cos(rad) * p.speed,
              y: Math.sin(rad) * p.speed - 20,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease }}
          />
        );
      })}
    </AnimatePresence>
  );

  return { fire, layer };
}

interface DownloadPageProps {
  translations: Record<LandingLanguage, Record<string, string>>;
}

export function DownloadPage({ translations }: DownloadPageProps) {
  const [lang, setLang] = useState<LandingLanguage>('en');

  useEffect(() => {
    const sync = () => {
      const next: LandingLanguage =
        document.documentElement.lang === 'pl' ? 'pl' : 'en';
      setLang(next);
    };
    sync();
    document.addEventListener('shiranami:lang-change', sync);
    return () => document.removeEventListener('shiranami:lang-change', sync);
  }, []);

  const t = useCallback(
    (key: string) => translations[lang]?.[key] ?? translations.en?.[key] ?? key,
    [translations, lang]
  );
  const locale = lang === 'pl' ? 'pl-PL' : 'en-US';

  const [release, setRelease] = useState<ReleaseData | null>(null);
  const [error, setError] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [detectedPlatform, setDetectedPlatform] = useState<Platform | null>(null);
  const { fire, layer } = useConfetti();

  useEffect(() => {
    setDetectedPlatform(detectPlatform());
  }, []);

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
    [fire]
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

  const buildAriaLabel = useCallback(
    ({ platform, ext, size }: { platform: string; ext: string; size: string }) =>
      t('download.downloadAria')
        .replace('{platform}', platform)
        .replace('{ext}', ext)
        .replace('{size}', size),
    [t]
  );

  return (
    <MotionConfig reducedMotion="user">
      {layer}

      <div className="download-block dl-block">
        <div className="dl-watermark" aria-hidden="true">
          白
        </div>

        <div className="download-grid">
          <div className="dl-copy">
            <div className="label" style={{ marginBottom: 14 }}>
              <span aria-hidden="true">●</span>{' '}
              <span>Section · DL &nbsp;·&nbsp; {t('download.eyebrow')}</span>
            </div>
            <h2>
              {downloaded ? (
                <>
                  <span>{t('download.headingAfterLead')}</span>{' '}
                  <em>{t('download.headingAfterAccent')}</em>
                </>
              ) : (
                <>
                  <span>{t('download.headingLead')}</span>{' '}
                  <em>{t('download.headingAccent')}</em>.
                </>
              )}
            </h2>

            <p className="dl-body" key={downloaded ? 'after' : 'before'}>
              {downloaded ? t('download.bodyAfter') : t('download.body')}
            </p>

            <div aria-live="polite" className="dl-sr">
              {downloaded ? t('download.downloadStartedAnnouncement') : ''}
            </div>

            <div className="dl-inline">
              <motion.img
                src="/assets/mascot.png"
                alt={t('download.mascotAlt')}
                className="dl-mascot-sm"
                draggable={false}
                animate={
                  downloaded
                    ? { y: 0, scale: [1, 1.14, 1], rotate: [0, -8, 8, 0] }
                    : { y: [0, -6, 0], scale: 1, rotate: 0 }
                }
                transition={
                  downloaded
                    ? { duration: 0.7, ease: 'easeOut' }
                    : { duration: 6, repeat: Infinity, ease: 'easeInOut' }
                }
              />
              {version && release ? (
                <div className="dl-release-chip">
                  <span className="rv">
                    <span className="rv-dot" aria-hidden="true" />v{version}
                  </span>
                  <span className="rd">
                    {formatPublishedDate(release.published_at, locale)}
                  </span>
                </div>
              ) : (
                <div className="dl-release-chip dl-release-chip-loading">
                  <span className="rv">
                    <span className="rv-dot" aria-hidden="true" />
                    {t('download.latestPublicBuild')}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="dl-platforms">
            {error ? (
              <div className="dl-error">
                <p>{t('download.fetchFailed')}</p>
                <a
                  href={GITHUB_RELEASES_LATEST_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost"
                >
                  <span>{t('download.getFromGithub')}</span>
                  <span className="arr" aria-hidden="true">→</span>
                </a>
              </div>
            ) : !release ? (
              <div className="platforms">
                {PLATFORMS.map((p) => (
                  <div key={p.key} className="platform platform-skeleton">
                    <div className="l">
                      <span className="platform-icon">
                        <PlatformIcon platform={p.key} />
                      </span>
                      <div>
                        <div className="pn">{t(p.labelKey)}</div>
                        <div className="ps">{t(p.tagKey)}</div>
                      </div>
                    </div>
                    <span className="r dl-loading">…</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="platforms">
                {PLATFORMS.map((p) => {
                  const asset = assetMap.get(p.key);
                  const isPrimary = p.key === detectedPlatform;
                  const label = t(p.labelKey);
                  const sizeText = asset
                    ? formatBytes(asset.size, locale)
                    : t('download.releasePage');
                  const href = asset
                    ? asset.browser_download_url
                    : release.html_url || GITHUB_RELEASES_LATEST_URL;
                  const ariaLabel = asset
                    ? buildAriaLabel({
                        platform: label,
                        ext: p.extension,
                        size: sizeText,
                      })
                    : label;

                  return (
                    <a
                      key={p.key}
                      href={href}
                      onClick={asset ? handleDownload : undefined}
                      target={asset ? undefined : '_blank'}
                      rel={asset ? undefined : 'noopener noreferrer'}
                      aria-label={ariaLabel}
                      className={'platform' + (isPrimary ? ' is-primary' : '')}
                    >
                      <div className="l">
                        <span className="platform-icon">
                          <PlatformIcon platform={p.key} />
                        </span>
                        <div>
                          <div className="pn">
                            {label}
                            {isPrimary && (
                              <span className="pn-badge">
                                {t('download.yourSystem')}
                              </span>
                            )}
                          </div>
                          <div className="ps">
                            {p.extension} · {sizeText}
                          </div>
                        </div>
                      </div>
                      <span className="r">
                        <span aria-hidden="true">↓</span>
                        <span>{t('download.action')}</span>
                      </span>
                    </a>
                  );
                })}
              </div>
            )}

            {detectedPlatform === 'mac' && (
              <div className="dl-note">
                <div className="dl-note-head">
                  <span style={{ color: 'var(--primary)' }}>
                    ● {t('download.unsignedShortTitle')}
                  </span>
                </div>
                <p>{t('download.unsignedShortBody')}</p>
                <code className="dl-code">
                  xattr -rd com.apple.quarantine /Applications/Shiranami.app
                </code>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="dl-links">
        <a href="/changelog" className="btn-ghost">
          <span aria-hidden="true">≡</span>
          <span>{t('download.changelog')}</span>
        </a>
        {release && (
          <a
            href={release.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost"
          >
            <span aria-hidden="true">↗</span>
            <span>{t('download.githubRelease')}</span>
          </a>
        )}
      </div>
    </MotionConfig>
  );
}
