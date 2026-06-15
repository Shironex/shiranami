import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DISCORD_TEMPLATES } from '@shiranami/shared';

import DiscordTemplateEditor from './DiscordTemplateEditor';

function reset(): void {
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

describe('DiscordTemplateEditor', () => {
  it('renders the template inputs for the selected activity', () => {
    render(
      <DiscordTemplateEditor
        selectedActivity="playing"
        onActivityChange={vi.fn()}
        currentTemplate={DEFAULT_DISCORD_TEMPLATES.playing}
        onTemplateChange={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(screen.getByText('Status templates')).toBeInTheDocument();
    expect(screen.getByDisplayValue(DEFAULT_DISCORD_TEMPLATES.playing.details)).toBeInTheDocument();
  });

  it('calls onReset when the reset button is clicked', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(
      <DiscordTemplateEditor
        selectedActivity="playing"
        onActivityChange={vi.fn()}
        currentTemplate={DEFAULT_DISCORD_TEMPLATES.playing}
        onTemplateChange={vi.fn()}
        onReset={onReset}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Restore defaults' }));

    expect(onReset).toHaveBeenCalledOnce();
  });
});
