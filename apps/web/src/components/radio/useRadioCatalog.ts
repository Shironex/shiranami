import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { logger } from '@/lib/logger';
import { loadCatalog, type CatalogEntry } from './radioCatalog';
import type { IFilterOption } from './FilterPopover';
import { countryNameFromCode, isoCodeToFlag, titleCase } from './radioUtils';

interface RadioCatalog {
  countries: IFilterOption[];
  languages: IFilterOption[];
  tags: IFilterOption[];
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
    void Promise.allSettled([
      loadCatalog('countries'),
      loadCatalog('languages'),
      loadCatalog('tags'),
    ]).then(([countriesResult, languagesResult, tagsResult]) => {
      if (cancelled) return;
      if (countriesResult.status === 'rejected')
        logger.warn('[radio] failed to load countries catalog:', countriesResult.reason);
      if (languagesResult.status === 'rejected')
        logger.warn('[radio] failed to load languages catalog:', languagesResult.reason);
      if (tagsResult.status === 'rejected')
        logger.warn('[radio] failed to load tags catalog:', tagsResult.reason);
      setRaw({
        countries: countriesResult.status === 'fulfilled' ? countriesResult.value : [],
        languages: languagesResult.status === 'fulfilled' ? languagesResult.value : [],
        tags: tagsResult.status === 'fulfilled' ? tagsResult.value : [],
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo<RadioCatalog>(() => {
    if (raw.countries.length === 0 && raw.languages.length === 0 && raw.tags.length === 0) {
      return EMPTY;
    }
    const countries: IFilterOption[] = raw.countries
      .map(entry => ({
        value: entry.value.toUpperCase(),
        label: countryNameFromCode(entry.value, language),
        prefix: isoCodeToFlag(entry.value),
        count: entry.count,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, language));

    const languages: IFilterOption[] = raw.languages
      .map(entry => ({ value: entry.value, label: titleCase(entry.value), count: entry.count }))
      .sort((a, b) => a.label.localeCompare(b.label, language));

    const tags: IFilterOption[] = raw.tags.map(entry => ({
      value: entry.value,
      label: titleCase(entry.value),
      count: entry.count,
    }));

    return { countries, languages, tags };
  }, [raw, language]);
}
