import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { logger } from '@/lib/logger';
import { loadCatalog, type CatalogEntry } from './radioCatalog';
import type { FilterOption } from './FilterPopover';
import { countryNameFromCode, isoCodeToFlag, titleCase } from './radioUtils';

interface RadioCatalog {
  countries: FilterOption[];
  languages: FilterOption[];
  tags: FilterOption[];
}

const EMPTY: RadioCatalog = { countries: [], languages: [], tags: [] };

/**
 * Loads the country / language / tag catalogs once (cached + revalidated) and
 * maps them into FilterOption lists: countries gain a flag prefix and a name
 * localized to the active UI language, languages and tags are title-cased.
 */
export function useRadioCatalog(): RadioCatalog {
  const { i18n } = useTranslation();
  const language = i18n.language;
  const [raw, setRaw] = useState<{
    countries: CatalogEntry[];
    languages: CatalogEntry[];
    tags: CatalogEntry[];
  }>({ countries: [], languages: [], tags: [] });

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadCatalog('countries'), loadCatalog('languages'), loadCatalog('tags')])
      .then(([countries, languages, tags]) => {
        if (cancelled) return;
        setRaw({ countries, languages, tags });
      })
      .catch(err => logger.warn('[radio] failed to load catalog:', err));
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo<RadioCatalog>(() => {
    if (raw.countries.length === 0 && raw.languages.length === 0 && raw.tags.length === 0) {
      return EMPTY;
    }
    const countries: FilterOption[] = raw.countries
      .map(entry => ({
        value: entry.value.toUpperCase(),
        label: countryNameFromCode(entry.value, language),
        prefix: isoCodeToFlag(entry.value),
        count: entry.count,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, language));

    const languages: FilterOption[] = raw.languages
      .map(entry => ({ value: entry.value, label: titleCase(entry.value), count: entry.count }))
      .sort((a, b) => a.label.localeCompare(b.label, language));

    const tags: FilterOption[] = raw.tags.map(entry => ({
      value: entry.value,
      label: titleCase(entry.value),
      count: entry.count,
    }));

    return { countries, languages, tags };
  }, [raw, language]);
}
