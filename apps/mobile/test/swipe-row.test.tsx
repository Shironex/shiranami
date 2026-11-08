import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import * as Haptics from 'expo-haptics';
import { SWIPE_THRESHOLD, SwipeRow } from '@/components/library/SwipeRow';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => {}) }));

const onPlayNext = jest.fn();
const onAddToPlaylist = jest.fn();

async function renderRow(withPlaylist = true) {
  await render(
    <SwipeRow
      testID="row"
      onPlayNext={onPlayNext}
      onAddToPlaylist={withPlaylist ? onAddToPlaylist : undefined}
    >
      <Text>Snowfall</Text>
    </SwipeRow>
  );
}

/** Fires a pan; worklets hand calls back to JS on a microtask, so wait one out. */
async function swipe(to: number) {
  fireGestureHandler(getByGestureTestId('row'), [
    { state: State.BEGAN, translationX: 0 },
    { state: State.ACTIVE, translationX: to / 2 },
    { translationX: to },
    { state: State.END, translationX: to },
  ]);
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('SwipeRow', () => {
  it('plays next after a swipe right past the threshold, with a haptic tick', async () => {
    await renderRow();
    await swipe(SWIPE_THRESHOLD + 10);
    expect(onPlayNext).toHaveBeenCalledTimes(1);
    expect(onAddToPlaylist).not.toHaveBeenCalled();
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a swipe that stops short', async () => {
    await renderRow();
    await swipe(SWIPE_THRESHOLD - 20);
    expect(onPlayNext).not.toHaveBeenCalled();
    expect(onAddToPlaylist).not.toHaveBeenCalled();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it('adds to a playlist after a swipe left', async () => {
    await renderRow();
    await swipe(-(SWIPE_THRESHOLD + 10));
    expect(onAddToPlaylist).toHaveBeenCalledTimes(1);
    expect(onPlayNext).not.toHaveBeenCalled();
  });

  it('ignores a swipe left when the row has no playlist action', async () => {
    await renderRow(false);
    await swipe(-(SWIPE_THRESHOLD + 40));
    expect(onAddToPlaylist).not.toHaveBeenCalled();
    expect(onPlayNext).not.toHaveBeenCalled();
  });
});
