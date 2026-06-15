import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import DiscordPreview from './DiscordPreview';

describe('DiscordPreview', () => {
  it('renders the details and state lines', () => {
    render(
      <DiscordPreview
        details="Midnight Tapes"
        state="Idealism"
        showTimestamp
        showLargeImage
        showButton
      />
    );

    expect(screen.getByText('Midnight Tapes')).toBeInTheDocument();
    expect(screen.getByText('Idealism')).toBeInTheDocument();
  });

  it('hides the state line when empty', () => {
    render(
      <DiscordPreview
        details="Midnight Tapes"
        state=""
        showTimestamp={false}
        showLargeImage={false}
        showButton={false}
      />
    );

    expect(screen.getByText('Midnight Tapes')).toBeInTheDocument();
    expect(screen.queryByText('Idealism')).not.toBeInTheDocument();
  });
});
