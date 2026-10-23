import type { LandingLanguage } from '../../lib/i18n';

/** Prerendered Polish release list (src/pages/changelog/pl.astro). */
const PL_URL = '/changelog/pl/';

type Lists = Partial<Record<LandingLanguage, Node[]>>;

// Survives client-router navigations, so Polish is fetched at most once.
let plMarkup: Promise<string | null> | null = null;

function loadPolish(): Promise<string | null> {
  plMarkup ??= fetch(PL_URL)
    .then(res => (res.ok ? res.text() : null))
    .catch(() => null)
    .then(text => {
      if (text == null) plMarkup = null; // let a later switch retry
      return text;
    });
  return plMarkup;
}

function currentLang(): LandingLanguage {
  return document.documentElement.lang === 'pl' ? 'pl' : 'en';
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!
  );
}

/** Wraps case-insensitive matches of the raw query in <mark class="rl-mark">. */
function highlight(el: HTMLElement, query: string) {
  const text = el.textContent ?? '';
  if (!query) {
    if (el.childElementCount) el.textContent = text;
    return;
  }
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lower = query.toLowerCase();
  el.innerHTML = text
    .split(new RegExp(`(${escaped})`, 'ig'))
    .map(part =>
      part.toLowerCase() === lower
        ? `<mark class="rl-mark">${escapeHtml(part)}</mark>`
        : escapeHtml(part)
    )
    .join('');
}

/** What the search looks through: title, summary, version, section names and entries. */
function haystack(article: HTMLElement): string {
  const parts = [...article.querySelectorAll<HTMLElement>('[data-hl]')].map(
    el => el.textContent ?? ''
  );
  parts.push(article.id.slice(1));
  article
    .querySelectorAll('.cat-label')
    .forEach(label => parts.push(label.lastChild?.textContent ?? ''));
  return parts.join(' ').toLowerCase();
}

/**
 * Sets data-stuck on the sticky filter bar while it sits under the navbar,
 * so its backdrop only shows then. A zero-height sentinel just above the bar
 * leaves the band above the bar's sticky offset exactly when the bar sticks.
 */
function watchStuck(bar: HTMLElement): () => void {
  const sentinel = document.createElement('div');
  sentinel.setAttribute('aria-hidden', 'true');
  bar.before(sentinel);
  const offset = parseFloat(getComputedStyle(bar).top) || 0;
  const io = new IntersectionObserver(
    ([entry]) => {
      const stuck = !entry.isIntersecting && entry.boundingClientRect.top < offset + 1;
      bar.toggleAttribute('data-stuck', stuck);
    },
    { rootMargin: `${-(offset + 1)}px 0px 0px 0px` }
  );
  io.observe(sentinel);
  return () => {
    io.disconnect();
    sentinel.remove();
  };
}

export function initChangelog() {
  const list = document.querySelector<HTMLElement>('[data-changelog-list]');
  const filters = document.querySelector<HTMLElement>('[data-changelog-filters]');
  const search = document.querySelector<HTMLInputElement>('[data-changelog-search]');
  if (!list || !filters || !search) return;

  const lists: Lists = { en: [...list.childNodes] };
  let lang: LandingLanguage = 'en';
  let filter = 'all';
  let articles: HTMLElement[] = [];
  let hay = new Map<HTMLElement, string>();
  let empty: HTMLElement | null = null;
  let tail: Node | null = null;

  // Index the list that is in the page: its releases, the empty state and
  // where filtered releases go back in (before the archive end).
  const index = () => {
    articles = [...list.querySelectorAll<HTMLElement>(':scope > article.release')];
    hay = new Map(articles.map(article => [article, haystack(article)]));
    const template = list.querySelector<HTMLTemplateElement>('template[data-changelog-empty]');
    empty = template?.content.firstElementChild?.cloneNode(true) as HTMLElement | null;
    tail = list.querySelector('.archive-end');
    for (const button of filters.querySelectorAll<HTMLElement>('[data-filter]')) {
      const kind = button.dataset.filter;
      const n =
        kind === 'all' ? articles.length : articles.filter(a => a.dataset.kind === kind).length;
      const count = button.querySelector('.c');
      if (count) count.textContent = String(n);
    }
  };

  // Matching releases stay in the list in order, the rest leave the DOM, as
  // the old React list did (so .release:first-of-type still finds the first).
  const apply = () => {
    const query = search.value;
    const q = query.trim().toLowerCase();
    let shown = 0;
    for (const article of articles) {
      const match =
        (filter === 'all' || article.dataset.kind === filter) &&
        (!q || hay.get(article)!.includes(q));
      if (match) {
        list.insertBefore(article, tail);
        article.querySelectorAll<HTMLElement>('[data-hl]').forEach(el => highlight(el, query));
        shown++;
      } else {
        article.remove();
      }
    }
    if (empty) {
      if (shown === 0) list.insertBefore(empty, tail);
      else empty.remove();
    }
    for (const button of filters.querySelectorAll<HTMLElement>('[data-filter]')) {
      button.classList.toggle('active', button.dataset.filter === filter);
    }
  };

  const setLang = async (next: LandingLanguage) => {
    const dict = (
      window as Window & {
        __shiranamiLandingTranslations?: Record<LandingLanguage, Record<string, string>>;
      }
    ).__shiranamiLandingTranslations?.[next];
    const placeholder = dict?.['changelog.search.placeholder'];
    if (placeholder) search.placeholder = placeholder;
    if (next === lang) return;

    if (!lists[next]) {
      const markup = await loadPolish();
      if (!markup || currentLang() !== next) return;
      const holder = document.createElement('template');
      holder.innerHTML = markup;
      // A second call may have finished the same swap while this one waited.
      if (lang === next) return;
      lists[next] = [...holder.content.childNodes];
    }
    // Park the current language's nodes (all releases, even filtered out ones)
    // and put the other language in.
    articles.forEach(article => list.insertBefore(article, tail));
    empty?.remove();
    lists[lang] = [...list.childNodes];
    list.replaceChildren(...lists[next]!);
    lang = next;
    index();
    apply();
  };

  filters.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLElement>('[data-filter]');
    if (!button) return;
    filter = button.dataset.filter ?? 'all';
    apply();
  });
  search.addEventListener('input', apply);

  // BaseLayout's i18n script may have applied the stored language before
  // this ran, so read it now and then follow its change event.
  const onLang = (event: Event) => {
    const next = (event as CustomEvent<{ lang?: string }>).detail?.lang;
    if (next === 'en' || next === 'pl') void setLang(next);
  };
  document.addEventListener('shiranami:lang-change', onLang);
  const unwatch = watchStuck(filters);
  document.addEventListener(
    'astro:before-swap',
    () => {
      document.removeEventListener('shiranami:lang-change', onLang);
      unwatch();
    },
    { once: true }
  );

  index();
  if (search.value) apply(); // a value restored by the browser
  void setLang(currentLang());
}
