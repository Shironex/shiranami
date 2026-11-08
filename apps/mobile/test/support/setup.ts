// Worklets cannot run under Jest; Reanimated's test setup swaps in its own
// JS implementation of shared values and animated styles.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
require('react-native-reanimated').setUpTests();

// Gesture handler ships mocks for its native module and components.
require('react-native-gesture-handler/jestSetup');
