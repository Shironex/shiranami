import type { ChangeEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Station } from 'radio-browser-api';
import type { useTranslation } from 'react-i18next';
import type { IFilterOption } from '../FilterPopover';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/** A browse/favorites mode tab, pre-resolved with its active state + handler. */
export interface IRadioModeTab {
  readonly id: string;
  /** Localized tab label. */
  readonly label: string;
  /** Lucide glyph rendered in the tab. */
  readonly icon: LucideIcon;
  /** Whether this tab is the active mode. */
  readonly isActive: boolean;
  /** Switch to this tab's mode. */
  readonly onClick: () => void;
}

/** A one-tap genre pill, pre-resolved with its active state + toggle handler. */
export interface IRadioGenrePill {
  readonly genre: string;
  /** Title-cased display label. */
  readonly label: string;
  /** Whether the genre is currently in the tag filter. */
  readonly isActive: boolean;
  /** Toggle this genre in the tag filter. */
  readonly onClick: () => void;
}

/** An active filter chip with its display label, optional prefix, and removal. */
export interface IRadioActiveChip {
  readonly key: string;
  /** Display label for the chip. */
  readonly label: string;
  /** Optional leading glyph (e.g. a country flag). */
  readonly prefix?: string;
  /** Localized aria-label for the chip's remove button. */
  readonly removeLabel: string;
  /** Remove this filter. */
  readonly onRemove: () => void;
}

/** The catalog of selectable countries, languages, and tags. */
export interface IRadioCatalog {
  readonly countries: IFilterOption[];
  readonly languages: IFilterOption[];
  readonly tags: IFilterOption[];
}

export interface IRadioViewView {
  /** Bound `radio` namespace translator. */
  readonly t: TranslateFn;
  /** The station list to render. */
  readonly stations: Station[];
  /** Favorited station ids. */
  readonly favorites: string[];
  /** Whether the initial search is loading (drives the skeleton). */
  readonly isLoading: boolean;
  /** Whether a "load more" page is in flight. */
  readonly isLoadingMore: boolean;
  /** Current error message, if any. */
  readonly error: string | null;
  /** The catalog of countries / languages / tags for the filter popovers. */
  readonly catalog: IRadioCatalog;
  /** Currently selected country code, or undefined. */
  readonly countryCode: string | undefined;
  /** Currently selected language, or undefined. */
  readonly language: string | undefined;
  /** Live value of the search input. */
  readonly searchDraft: string;
  /** Browse vs favorites mode tabs, pre-resolved. */
  readonly modeTabs: readonly IRadioModeTab[];
  /** One-tap genre pills, pre-resolved. */
  readonly genrePills: readonly IRadioGenrePill[];
  /** Active filter chips, pre-resolved. */
  readonly activeChips: readonly IRadioActiveChip[];
  /** Whether the "clear all" affordance shows (two or more active chips). */
  readonly showClearAll: boolean;
  /** Whether the active-filter / result-count row renders. */
  readonly showFilterBar: boolean;
  /** Whether the result count shows. */
  readonly showResultCount: boolean;
  /** Localized result-count label. */
  readonly resultCountLabel: string;
  /** Whether the "near you" locale shortcut is available. */
  readonly hasLocaleCode: boolean;
  /** Whether the "near you" filter is active. */
  readonly isLocalActive: boolean;
  /** Whether the empty state shows (no stations, not loading, no error). */
  readonly showEmptyState: boolean;
  /** Whether the current mode is favorites. */
  readonly isFavoritesMode: boolean;
  /** Whether any name/facet filter is active. */
  readonly hasFacetFilters: boolean;
  /** Whether the low-results hint shows. */
  readonly isLowResults: boolean;
  /** Whether the "load more" button shows. */
  readonly showLoadMore: boolean;
  /** Currently playing track id, used to highlight the active station row. */
  readonly currentTrackId: string | null;
  /** Whether playback is active. */
  readonly isPlaying: boolean;
  /** Number of skeleton rows to render while loading. */
  readonly skeletonRows: number;
  /** Whether the diary panel is showing. */
  readonly isDiaryOpen: boolean;
  /**
   * The station the diary shows — the one on air — or null when nothing radio
   * is playing.
   */
  readonly diaryStationUuid: string | null;
  /** That station's display name, for the diary header. */
  readonly diaryStationName: string | null;
  /** Show or hide the diary panel. */
  readonly onToggleDiary: () => void;
  /** Hide the diary panel. */
  readonly onCloseDiary: () => void;
  /** Update the search input + debounce a filter run. */
  readonly onSearchInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Toggle the "near you" locale-country filter. */
  readonly onToggleLocal: () => void;
  /** Select a country filter value (or undefined to clear). */
  readonly onSelectCountry: (value: string | null) => void;
  /** Select a language filter value (or undefined to clear). */
  readonly onSelectLanguage: (value: string | null) => void;
  /** Select a tag/genre filter value. */
  readonly onSelectTag: (value: string | null) => void;
  /** Clear every active filter. */
  readonly onClearAll: () => void;
  /** Retry the current search (or favorites load). */
  readonly onRetry: () => void;
  /** Load the next page of stations. */
  readonly onLoadMore: () => void;
  /** Play a station by its list index. */
  readonly onPlayStation: (index: number) => void;
  /** Toggle a station's favorite state. */
  readonly onToggleFavorite: (station: Station) => void;
}
