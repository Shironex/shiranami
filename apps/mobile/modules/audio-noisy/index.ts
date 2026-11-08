import { requireOptionalNativeModule } from 'expo';

type EventSubscription = { remove: () => void };

type AudioNoisyEvents = { onBecomingNoisy: () => void };

interface AudioNoisyModule {
  addListener<E extends keyof AudioNoisyEvents>(
    event: E,
    listener: AudioNoisyEvents[E]
  ): EventSubscription;
}

const native = requireOptionalNativeModule<AudioNoisyModule>('AudioNoisy');

/**
 * Calls `listener` when audio output is about to fall back to the speaker
 * (headphones unplugged, Bluetooth headset disconnected). Android only; a
 * no-op where the native module is missing.
 */
export function addBecomingNoisyListener(listener: () => void): () => void {
  if (!native) return () => undefined;
  const subscription = native.addListener('onBecomingNoisy', listener);
  return () => subscription.remove();
}
