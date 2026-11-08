import { fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import * as Haptics from 'expo-haptics';
import { SWIPE_THRESHOLD, SwipeRow } from '@/components/library/SwipeRow';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => {}) }));

const onPlayNext = jest.fn();
const onAddToPlaylist = jest.fn();
/** What tapping the row does: start the song. */
const play = jest.fn();

async function renderRow(withPlaylist = true) {
  await render(
    <SwipeRow
      testID="row"
      onPlayNext={onPlayNext}
      onAddToPlaylist={withPlaylist ? onAddToPlaylist : undefined}
    >
      {guard => (
        <Pressable accessibilityRole="button" onPress={guard(play)}>
          <Text>Snowfall</Text>
        </Pressable>
      )}
    </SwipeRow>
  );
}

/** Fires a pan; worklets hand calls back to JS on a microtask, so wait one out. */
async function swipe(to: number) {
  await gesture([
    { state: State.BEGAN, translationX: 0 },
    { state: State.ACTIVE, translationX: to / 2 },
    { translationX: to },
    { state: State.END, translationX: to },
  ]);
}

async function gesture(events: Parameters<typeof fireGestureHandler>[1]) {
  fireGestureHandler(getByGestureTestId('row'), events);
  await new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * A finger going down for a tap. The test utility always walks a gesture
 * through ACTIVE, so call the pan's begin callback the way a fresh touch does.
 */
async function touchDown() {
  const pan = getByGestureTestId('row') as unknown as {
    handlers: { onBegin?: (event: object) => void };
  };
  pan.handlers.onBegin?.({});
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

  it('ignores the tap that ends a swipe, so the song does not start', async () => {
    await renderRow();
    await swipe(SWIPE_THRESHOLD + 10);
    await fireEvent.press(screen.getByText('Snowfall'));
    expect(onPlayNext).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();
  });

  it('ignores the tap after a short swipe that did nothing', async () => {
    await renderRow();
    await swipe(SWIPE_THRESHOLD - 30);
    await fireEvent.press(screen.getByText('Snowfall'));
    expect(play).not.toHaveBeenCalled();
  });

  it('plays on a plain tap, and again on the next touch after a swipe', async () => {
    await renderRow();
    await fireEvent.press(screen.getByText('Snowfall'));
    expect(play).toHaveBeenCalledTimes(1);

    await swipe(SWIPE_THRESHOLD + 10);
    await touchDown();
    await fireEvent.press(screen.getByText('Snowfall'));
    expect(play).toHaveBeenCalledTimes(2);
  });
});
