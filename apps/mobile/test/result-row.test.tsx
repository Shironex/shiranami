import { fireEvent, render, screen } from '@testing-library/react-native';
import { ResultRow } from '@/components/search/ResultRow';
import type { SearchResult } from '@/lib/types';

jest.mock('@/context/SettingsContext', () => ({
  useSettingsContext: () => ({ settings: { placeholderArt: 'kanji' } }),
}));

const RESULT: SearchResult = {
  id: 'abcdefghijk',
  title: 'Snowfall',
  uploader: 'Night Band',
  duration: 214,
  thumbnail: '',
  url: 'https://www.youtube.com/watch?v=abcdefghijk',
};

async function renderRow(props: Partial<Parameters<typeof ResultRow>[0]> = {}) {
  const handlers = { onPress: jest.fn(), onSave: jest.fn(), onCancel: jest.fn() };
  await render(
    <ResultRow
      result={RESULT}
      active={false}
      playing={false}
      loading={false}
      saved={false}
      job={undefined}
      playError={null}
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

describe('ResultRow', () => {
  it('shows the channel and length, and saves on the arrow', async () => {
    const { onSave, onPress } = await renderRow();

    expect(screen.getByText('Night Band')).toBeTruthy();
    expect(screen.getByText('3:34')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save Snowfall to this phone'));
    expect(onSave).toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Snowfall'));
    expect(onPress).toHaveBeenCalled();
  });

  it('shows progress while saving and cancels on the cross', async () => {
    const { onCancel } = await renderRow({ job: { status: 'saving', progress: 0.42 } });

    expect(screen.getByText('Saving 42%')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Stop saving Snowfall'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('marks a saved song and offers no second save', async () => {
    await renderRow({ saved: true });

    expect(screen.getByText('Night Band · On this phone')).toBeTruthy();
    expect(screen.getByLabelText('Snowfall is saved on this phone')).toBeTruthy();
    expect(screen.queryByLabelText('Save Snowfall to this phone')).toBeNull();
  });

  it('shows why a save or a play failed', async () => {
    await renderRow({ job: { status: 'failed', error: "Can't reach the server" } });
    expect(screen.getByText("Can't reach the server")).toBeTruthy();
  });
});
