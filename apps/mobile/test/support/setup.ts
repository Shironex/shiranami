// Worklets cannot run under Jest; Reanimated's test setup swaps in its own
// JS implementation of shared values and animated styles.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
require('react-native-reanimated').setUpTests();

// expo-router's testing library replaces Reanimated with its bundled mock,
// which leaves out useReducedMotion; route tests render screens that read it.
jest.mock('react-native-reanimated/mock', () => ({
  ...jest.requireActual('react-native-reanimated/mock'),
  useReducedMotion: () => false,
}));

// Gesture handler ships mocks for its native module and components.
require('react-native-gesture-handler/jestSetup');
