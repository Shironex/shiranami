import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ChangelogLanguage, ReleaseKind } from '../../lib/changelog';

export interface ChangelogRow {
  version: string;
  rawDate: string;
  date: string;
  weekday: string;
  kanji: string;
  title: string;
  description: string;
  kind: ReleaseKind;
  kindLabel: string;
  categories: Array<{
    label: string;
    entries: string[];
  }>;
  entriesCount: number;
}

export interface ChangelogCopy {
  filters: {
    all: string;
    feature: string;
    fix: string;
    perf: string;
    polish: string;
  };
  searchPlaceholder: string;
  entry: string;
  entryNumber: string; // "Entry №"
  itemsSingular: string;
  itemsPlural: string;
  empty: string;
  emptyHint: string;
  latest: string;
  rowVersion: string;
  rowKind: string;
  rowEntries: string;
  rowSections: string;
  jumpTitle: string;
  stamp: string;
  quietNote: string;
}

interface Props {
  releasesByLang: Record<ChangelogLanguage, ChangelogRow[]>;
  copyByLang: Record<ChangelogLanguage, ChangelogCopy>;
  initialLang: ChangelogLanguage;
}

function highlight(text: string, query: string): ReactNode {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'ig'));
  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={index} className="rl-mark">
        {part}
      </mark>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    )
  );
}

export function ChangelogView({ releasesByLang, copyByLang, initialLang }: Props) {
  const [lang, setLang] = useState<ChangelogLanguage>(initialLang);
  const [filter, setFilter] = useState<'all' | ReleaseKind>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const htmlLang = document.documentElement.lang;
    if (htmlLang === 'pl' || htmlLang === 'en') setLang(htmlLang);

    const onLangChange = (event: Event) => {
      const detail = (event as CustomEvent<{ lang: ChangelogLanguage }>).detail;
      if (detail?.lang === 'pl' || detail?.lang === 'en') setLang(detail.lang);
    };
    document.addEventListener('shiranami:lang-change', onLangChange);
    return () => document.removeEventListener('shiranami:lang-change', onLangChange);
  }, []);

  const releases = releasesByLang[lang];
  const copy = copyByLang[lang];

  const counts = useMemo(
    () => ({
      all: releases.length,
      feature: releases.filter((r) => r.kind === 'feature').length,
      fix: releases.filter((r) => r.kind === 'fix').length,
      perf: releases.filter((r) => r.kind === 'perf').length,
      polish: releases.filter((r) => r.kind === 'polish').length,
    }),
    [releases]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return releases.filter((release) => {
      if (filter !== 'all' && release.kind !== filter) return false;
      if (!q) return true;
      const hay = [
        release.title,
        release.description,
        release.version,
        ...release.categories.flatMap((c) => [c.label, ...c.entries]),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [releases, filter, query]);

  const chips: Array<{ k: 'all' | ReleaseKind; label: string; n: number }> = [
    { k: 'all', label: copy.filters.all, n: counts.all },
    { k: 'feature', label: copy.filters.feature, n: counts.feature },
    { k: 'fix', label: copy.filters.fix, n: counts.fix },
    { k: 'perf', label: copy.filters.perf, n: counts.perf },
    { k: 'polish', label: copy.filters.polish, n: counts.polish },
  ];

  const latest = releases[0];

  return (
    <>
      <div className="filters page">
        <div className="filter-group">
          {chips.map((chip) => (
            <button
              key={chip.k}
              type="button"
              className={'filter-chip' + (filter === chip.k ? ' active' : '')}
              onClick={() => setFilter(chip.k)}
            >
              {chip.label}
              <span className="c">{chip.n}</span>
            </button>
          ))}
        </div>
        <div className="filter-spacer" />
        <div className="search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder={copy.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={copy.searchPlaceholder}
          />
        </div>
      </div>

      <main className="releases page">
        {filtered.length === 0 ? (
          <div className="empty">
            {copy.empty}
            <br />
            <span
              style={{
                fontSize: 14,
                fontStyle: 'normal',
                fontFamily: 'var(--font-mono)',
                color: 'var(--ink-mute)',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                display: 'block',
                marginTop: 12,
              }}
            >
              {copy.emptyHint}
            </span>
          </div>
        ) : (
          filtered.map((release) => {
            const isLatest = release === latest;
            const releaseIndex = releases.indexOf(release);
            return (
              <article
                key={release.version}
                className={'release' + (isLatest ? ' is-latest' : '')}
                id={`v${release.version}`}
              >
                <div className="rl-gutter">
                  <div className={'kanji' + (isLatest ? ' is-latest' : '')} aria-hidden="true">
                    {release.kanji}
                  </div>
                  <div>
                    {copy.entryNumber} {String(releaseIndex + 1).padStart(2, '0')}
                  </div>
                  <div className="ver">
                    <span className="dp" aria-hidden="true" /> v{release.version}
                  </div>
                </div>

                <div className="rl-body">
                  <h2>{highlight(release.title, query)}</h2>
                  <p className="lede">{highlight(release.description, query)}</p>

                  {release.categories.map((category, i) => (
                    <div className="cat" key={`${release.version}-${i}`}>
                      <div className="cat-head">
                        <span className="cat-label">
                          <span className="cn">{String.fromCharCode(65 + i)}</span>
                          {category.label}
                        </span>
                        <span className="rule" />
                        <span className="count">
                          {category.entries.length}{' '}
                          {category.entries.length === 1 ? copy.itemsSingular : copy.itemsPlural}
                        </span>
                      </div>
                      <ul className="cat-list">
                        {category.entries.map((entry, j) => (
                          <li key={j}>
                            <span className="idx">{String(j + 1).padStart(2, '0')}</span>
                            <span>{highlight(entry, query)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                <aside className="rl-side">
                  <div className="rl-card">
                    <div className="rl-date">
                      <span className="weekday">{release.weekday}</span>
                      {release.date}
                    </div>
                    <hr />
                    <div className="row">
                      <span>{copy.rowVersion}</span>
                      <b style={{ color: 'var(--primary)' }}>v{release.version}</b>
                    </div>
                    <div className="row">
                      <span>{copy.rowKind}</span>
                      <b>{release.kindLabel}</b>
                    </div>
                    <div className="row">
                      <span>{copy.rowEntries}</span>
                      <b>{release.entriesCount}</b>
                    </div>
                    <div className="row">
                      <span>{copy.rowSections}</span>
                      <b>{release.categories.length}</b>
                    </div>
                    <div className="chips">
                      {release.categories.map((c, i) => (
                        <span className="chip" key={i}>
                          <span className="d" aria-hidden="true" />
                          {c.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </aside>
              </article>
            );
          })
        )}

        <div className="archive-end">
          <div className="stamp">{copy.stamp}</div>
          <div className="quiet">{copy.quietNote}</div>
        </div>

        <div className="jump-bar">
          <h5>{copy.jumpTitle}</h5>
          <div className="jump-list">
            {releases.map((release) => (
              <a key={release.version} href={`#v${release.version}`}>
                <span className="jv">v{release.version}</span>
                <span className="jt">{release.title}</span>
                <span className="jd">{release.date}</span>
              </a>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
