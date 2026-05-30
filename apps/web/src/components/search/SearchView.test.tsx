import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
// Ensure i18n is initialised before any component import
import '@/lib/i18n';

// ---------------------------------------------------------------------------
// Mock return values (hoisted so vi.mock factories can reference them)
// ---------------------------------------------------------------------------

const mockUseSearch = vi.hoisted(() => ({
  query: '',
  setQuery: vi.fn(),
  results: [] as Array<{
    id: string;
    title: string;
    uploader: string;
    duration: number;
    thumbnail: string;
    url: string;
    webpage_url: string;
    view_count?: number;
  }>,
  isSearching: false,
  searchError: null as string | null,
  handleSearch: vi.fn(),
  handleKeyDown: vi.fn(),
  handleDownload: vi.fn(),
  getDownloadState: vi.fn().mockReturnValue({ progress: 0, status: 'idle' }),
  previewLoadingId: null as string | null,
  isPreviewPlaying: vi.fn().mockReturnValue(false),
  handlePreview: vi.fn(),
}));

const mockUseSearchDependencies = vi.hoisted(() => ({
  dependencyState: 'ready' as 'checking' | 'needs-install' | 'ready',
  dependencyInstallStatus: 'idle' as 'idle' | 'downloading' | 'done' | 'error',
  dependencyInstallError: null as string | null,
  dependenciesSnapshot: null as { ytdlpInstalled: boolean; ffmpegInstalled: boolean } | null,
  isDependencyInstallInProgress: false,
  dependencyInstallProgress: 0,
  dependencyInstallLabel: '',
  dependencyInstallTarget: '' as string,
  handleInstallDependencies: vi.fn(),
}));

const mockUseSearchSuggestions = vi.hoisted(() => ({
  suggestions: [] as string[],
  highlightedIndex: -1,
  setHighlightedIndex: vi.fn(),
  isOpen: false,
  setIsOpen: vi.fn(),
  close: vi.fn(),
  dismiss: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useSearch', () => ({
  useSearch: () => mockUseSearch,
}));

vi.mock('@/hooks/useSearchDependencies', () => ({
  useSearchDependencies: () => mockUseSearchDependencies,
}));

vi.mock('@/hooks/useSearchSuggestions', () => ({
  useSearchSuggestions: () => mockUseSearchSuggestions,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetMocks() {
  mockUseSearch.query = '';
  mockUseSearch.results = [];
  mockUseSearch.isSearching = false;
  mockUseSearch.searchError = null;
  mockUseSearch.previewLoadingId = null;
  mockUseSearch.setQuery.mockReset();
  mockUseSearch.handleSearch.mockReset();
  mockUseSearch.handleKeyDown.mockReset();
  mockUseSearch.handleDownload.mockReset();
  mockUseSearch.getDownloadState.mockReset().mockReturnValue({ progress: 0, status: 'idle' });
  mockUseSearch.isPreviewPlaying.mockReset().mockReturnValue(false);
  mockUseSearch.handlePreview.mockReset();

  mockUseSearchDependencies.dependencyState = 'ready';
  mockUseSearchDependencies.dependencyInstallStatus = 'idle';
  mockUseSearchDependencies.dependencyInstallError = null;
  mockUseSearchDependencies.dependenciesSnapshot = null;
  mockUseSearchDependencies.isDependencyInstallInProgress = false;
  mockUseSearchDependencies.dependencyInstallProgress = 0;
  mockUseSearchDependencies.dependencyInstallLabel = '';
  mockUseSearchDependencies.dependencyInstallTarget = '';
  mockUseSearchDependencies.handleInstallDependencies.mockReset();

  mockUseSearchSuggestions.suggestions = [];
  mockUseSearchSuggestions.highlightedIndex = -1;
  mockUseSearchSuggestions.isOpen = false;
  mockUseSearchSuggestions.setHighlightedIndex.mockReset();
  mockUseSearchSuggestions.setIsOpen.mockReset();
  mockUseSearchSuggestions.close.mockReset();
  mockUseSearchSuggestions.dismiss.mockReset();
}

function makeFakeResult(overrides: Partial<(typeof mockUseSearch.results)[0]> = {}) {
  return {
    id: 'vid-1',
    title: 'Test Song',
    uploader: 'Test Artist',
    duration: 210,
    thumbnail: '',
    url: 'https://youtube.com/watch?v=abc',
    webpage_url: 'https://youtube.com/watch?v=abc',
    view_count: 1000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests — SearchView
// ---------------------------------------------------------------------------

describe('SearchView', () => {
  beforeEach(() => {
    resetMocks();
  });

  // Lazy-import so mocks are in place before the module loads
  async function renderSearchView() {
    const { SearchView } = await import('./SearchView');
    return render(<SearchView />);
  }

  it('renders the search input', async () => {
    await renderSearchView();
    expect(screen.getByPlaceholderText('Search for music...')).toBeInTheDocument();
  });

  it('shows the checking state while dependencies are being verified', async () => {
    mockUseSearchDependencies.dependencyState = 'checking';
    await renderSearchView();
    expect(screen.getByText('Preparing search')).toBeInTheDocument();
    expect(screen.getByText(/Checking yt-dlp and ffmpeg/)).toBeInTheDocument();
  });

  it('shows DependencyInstallCard when dependencies are missing', async () => {
    mockUseSearchDependencies.dependencyState = 'needs-install';
    mockUseSearchDependencies.dependenciesSnapshot = {
      ytdlpInstalled: false,
      ffmpegInstalled: false,
    };
    await renderSearchView();
    expect(screen.getByText('Search tools missing')).toBeInTheDocument();
    expect(screen.getByText(/Install Missing Tools/)).toBeInTheDocument();
  });

  it('shows the empty state when there are no results and no search in progress', async () => {
    await renderSearchView();
    expect(screen.getByText('Search YouTube for music')).toBeInTheDocument();
    expect(screen.getByText('Type a song name and press Enter')).toBeInTheDocument();
  });

  it('shows the loading state while searching', async () => {
    mockUseSearch.isSearching = true;
    mockUseSearch.query = 'lofi beats';
    await renderSearchView();
    expect(screen.getByText('Searching YouTube')).toBeInTheDocument();
    expect(screen.getByText(/Pulling the best matches for "lofi beats"/)).toBeInTheDocument();
  });

  it('shows the error state when search fails', async () => {
    mockUseSearch.searchError = 'Something went wrong';
    await renderSearchView();
    expect(screen.getByText(/No results found/)).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders search results', async () => {
    mockUseSearch.results = [
      makeFakeResult({ id: 'v1', title: 'First Track', uploader: 'Artist A' }),
      makeFakeResult({ id: 'v2', title: 'Second Track', uploader: 'Artist B' }),
    ];
    await renderSearchView();
    expect(screen.getByText('First Track')).toBeInTheDocument();
    expect(screen.getByText('Second Track')).toBeInTheDocument();
  });

  it('renders download button for each result', async () => {
    mockUseSearch.results = [makeFakeResult()];
    await renderSearchView();
    expect(screen.getByRole('button', { name: 'Download Test Song' })).toBeInTheDocument();
  });

  it('calls handleDownload when download button is clicked', async () => {
    const user = userEvent.setup();
    const result = makeFakeResult();
    mockUseSearch.results = [result];
    await renderSearchView();

    await user.click(screen.getByRole('button', { name: 'Download Test Song' }));
    expect(mockUseSearch.handleDownload).toHaveBeenCalled();
  });

  it('shows a progress bar when a result is downloading', async () => {
    const result = makeFakeResult();
    mockUseSearch.results = [result];
    mockUseSearch.getDownloadState.mockReturnValue({
      progress: 42,
      status: 'downloading',
    });
    await renderSearchView();
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toBeInTheDocument();
    expect(progressbar).toHaveAttribute('aria-valuenow', '42');
  });

  it('shows a check icon when download is done', async () => {
    const result = makeFakeResult();
    mockUseSearch.results = [result];
    mockUseSearch.getDownloadState.mockReturnValue({
      progress: 100,
      status: 'done',
    });
    await renderSearchView();
    // Download button should be replaced; no "Download" title present
    expect(screen.queryByTitle('Download')).not.toBeInTheDocument();
  });

  it('shows background install banner when dependency install is in progress', async () => {
    mockUseSearchDependencies.isDependencyInstallInProgress = true;
    mockUseSearchDependencies.dependencyInstallTarget = 'ffmpeg';
    mockUseSearchDependencies.dependencyInstallLabel = 'Downloading ffmpeg';
    mockUseSearchDependencies.dependencyInstallProgress = 65;
    await renderSearchView();
    expect(screen.getByText(/Installing ffmpeg in the background/)).toBeInTheDocument();
    expect(screen.getByText(/Downloading ffmpeg.*65%/)).toBeInTheDocument();
  });

  it('calls dismiss and delegates to originalHandleKeyDown when Enter is pressed with suggestions open but none highlighted', async () => {
    const user = userEvent.setup();
    mockUseSearchSuggestions.suggestions = ['lofi beats', 'lofi hip hop'];
    mockUseSearchSuggestions.isOpen = true;
    mockUseSearchSuggestions.highlightedIndex = -1;
    await renderSearchView();

    const input = screen.getByPlaceholderText('Search for music...');
    await user.click(input);
    await user.keyboard('{Enter}');

    expect(mockUseSearchSuggestions.dismiss).toHaveBeenCalledOnce();
    expect(mockUseSearch.handleKeyDown).toHaveBeenCalled();
  });

  it('selects the highlighted suggestion and does not delegate to originalHandleKeyDown when Enter is pressed with a suggestion highlighted', async () => {
    const user = userEvent.setup();
    mockUseSearchSuggestions.suggestions = ['lofi beats', 'lofi hip hop'];
    mockUseSearchSuggestions.isOpen = true;
    mockUseSearchSuggestions.highlightedIndex = 0;
    await renderSearchView();

    const input = screen.getByPlaceholderText('Search for music...');
    await user.click(input);
    await user.keyboard('{Enter}');

    // selectAndSearch calls dismiss + setQuery; originalHandleKeyDown must NOT be called
    expect(mockUseSearch.setQuery).toHaveBeenCalledWith('lofi beats');
    expect(mockUseSearch.handleKeyDown).not.toHaveBeenCalled();
  });

  it('does not call dismiss when Enter is pressed with suggestions closed', async () => {
    const user = userEvent.setup();
    mockUseSearchSuggestions.suggestions = ['lofi beats'];
    mockUseSearchSuggestions.isOpen = false;
    mockUseSearchSuggestions.highlightedIndex = -1;
    await renderSearchView();

    const input = screen.getByPlaceholderText('Search for music...');
    await user.click(input);
    await user.keyboard('{Enter}');

    expect(mockUseSearchSuggestions.dismiss).not.toHaveBeenCalled();
    expect(mockUseSearch.handleKeyDown).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests — DependencyInstallCard
// ---------------------------------------------------------------------------

describe('DependencyInstallCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function renderCard(
    props: Partial<{
      ffmpegInstalled: boolean | undefined;
      installStatus: 'idle' | 'downloading' | 'done' | 'error';
      installError: string | null;
      isInstallInProgress: boolean;
      installProgress: number;
      installLabel: string;
      onInstall: () => void;
    }> = {}
  ) {
    const { DependencyInstallCard } = await import('./DependencyInstallCard');
    const defaults = {
      ffmpegInstalled: false,
      installStatus: 'idle' as const,
      installError: null,
      isInstallInProgress: false,
      installProgress: 0,
      installLabel: '',
      onInstall: vi.fn(),
    };
    const merged = { ...defaults, ...props };
    return { ...render(<DependencyInstallCard {...merged} />), props: merged };
  }

  it('shows install button when status is idle', async () => {
    await renderCard();
    expect(screen.getByText('Install Missing Tools')).toBeInTheDocument();
  });

  it('shows description mentioning both tools when ffmpeg is not installed', async () => {
    await renderCard({ ffmpegInstalled: false });
    expect(screen.getByText(/yt-dlp and ffmpeg/)).toBeInTheDocument();
  });

  it('shows description for yt-dlp only when ffmpeg is already installed', async () => {
    await renderCard({ ffmpegInstalled: undefined });
    expect(screen.getByText(/Install yt-dlp so Shiranami/)).toBeInTheDocument();
  });

  it('triggers onInstall when install button is clicked', async () => {
    const user = userEvent.setup();
    const onInstall = vi.fn();
    await renderCard({ onInstall });
    await user.click(screen.getByText('Install Missing Tools'));
    expect(onInstall).toHaveBeenCalledOnce();
  });

  it('shows progress bar when installing', async () => {
    await renderCard({
      installStatus: 'downloading',
      isInstallInProgress: true,
      installProgress: 55,
      installLabel: 'Downloading yt-dlp',
    });
    expect(screen.queryByText('Install Missing Tools')).not.toBeInTheDocument();
    expect(screen.getByText(/Downloading yt-dlp.*55%/)).toBeInTheDocument();
  });

  it('shows progress bar when isInstallInProgress even if status is idle', async () => {
    await renderCard({
      installStatus: 'idle',
      isInstallInProgress: true,
      installProgress: 30,
      installLabel: 'Preparing',
    });
    expect(screen.getByText(/Preparing.*30%/)).toBeInTheDocument();
  });

  it('shows success state when install is done', async () => {
    await renderCard({ installStatus: 'done' });
    expect(screen.getByText('Search tools installed')).toBeInTheDocument();
    expect(screen.queryByText('Install Missing Tools')).not.toBeInTheDocument();
  });

  it('shows error message when install fails', async () => {
    await renderCard({
      installStatus: 'error',
      installError: 'Network timeout',
    });
    expect(screen.getByText('Install Missing Tools')).toBeInTheDocument();
    expect(screen.getByText('Network timeout')).toBeInTheDocument();
  });
});
