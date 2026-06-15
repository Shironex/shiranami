import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import SettingsView from './SettingsView';

// The section panels carry their own store/IPC wiring — out of scope for the
// shell's nav + header chrome. Stub each so the smoke test stays isolated.
// (Factories are inlined because `vi.mock` is hoisted above local helpers.)
vi.mock('@/components/settings/MusicFoldersSection', () => ({
  MusicFoldersSection: () => <div data-testid="MusicFoldersSection" />,
}));
vi.mock('@/components/settings/LibrarySection', () => ({
  LibrarySection: () => <div data-testid="LibrarySection" />,
}));
vi.mock('@/components/settings/MetadataEnrichSection', () => ({
  MetadataEnrichSection: () => <div data-testid="MetadataEnrichSection" />,
}));
vi.mock('@/components/settings/downloads/DownloadsSection', () => ({
  DownloadsSection: () => <div data-testid="DownloadsSection" />,
}));
vi.mock('@/components/settings/PlaybackSection', () => ({
  PlaybackSection: () => <div data-testid="PlaybackSection" />,
}));
vi.mock('@/components/settings/EqualizerSection', () => ({
  EqualizerSection: () => <div data-testid="EqualizerSection" />,
}));
vi.mock('@/components/settings/VisualizerSection', () => ({
  VisualizerSection: () => <div data-testid="VisualizerSection" />,
}));
vi.mock('@/components/settings/UpdatesSection', () => ({
  UpdatesSection: () => <div data-testid="UpdatesSection" />,
}));
vi.mock('@/components/settings/AppearanceSection', () => ({
  AppearanceSection: () => <div data-testid="AppearanceSection" />,
}));
vi.mock('@/components/settings/SidebarSection', () => ({
  SidebarSection: () => <div data-testid="SidebarSection" />,
}));
vi.mock('@/components/settings/VisualEffectsSection', () => ({
  VisualEffectsSection: () => <div data-testid="VisualEffectsSection" />,
}));
vi.mock('@/components/settings/InterfaceSection', () => ({
  InterfaceSection: () => <div data-testid="InterfaceSection" />,
}));
vi.mock('@/components/settings/LyricsSection', () => ({
  LyricsSection: () => <div data-testid="LyricsSection" />,
}));
vi.mock('@/components/settings/CompactSection', () => ({
  CompactSection: () => <div data-testid="CompactSection" />,
}));
vi.mock('@/components/settings/AboutSection', () => ({
  AboutSection: () => <div data-testid="AboutSection" />,
}));
vi.mock('@/components/settings/SupportSection', () => ({
  SupportSection: () => <div data-testid="SupportSection" />,
}));
vi.mock('@/components/settings/DiscordSection', () => ({
  DiscordSection: () => <div data-testid="DiscordSection" />,
}));
vi.mock('@/components/settings/PrivacySection', () => ({
  PrivacySection: () => <div data-testid="PrivacySection" />,
}));
vi.mock('@/components/settings/WeatherSection', () => ({
  WeatherSection: () => <div data-testid="WeatherSection" />,
}));
vi.mock('@/components/settings/ScrobbleSection', () => ({
  ScrobbleSection: () => <div data-testid="ScrobbleSection" />,
}));
vi.mock('@/components/settings/SystemSection', () => ({
  SystemSection: () => <div data-testid="SystemSection" />,
}));

describe('SettingsView', () => {
  it('renders the section navigation and the default panel', () => {
    render(<SettingsView />);

    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByTestId('MusicFoldersSection')).toBeInTheDocument();
  });

  it('switches the active panel when a nav item is selected', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await user.click(screen.getByRole('button', { name: 'Equalizer' }));

    expect(screen.getByTestId('EqualizerSection')).toBeInTheDocument();
  });
});
