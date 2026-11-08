package expo.modules.audionoisy

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Emits `onBecomingNoisy` when audio is about to switch to the phone speaker,
 * for example when headphones are unplugged or a Bluetooth headset drops.
 * expo-audio does not handle this broadcast, so the app pauses itself.
 */
class AudioNoisyModule : Module() {
  private var receiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("AudioNoisy")

    Events(BECOMING_NOISY)

    OnStartObserving(BECOMING_NOISY) { register() }
    OnStopObserving(BECOMING_NOISY) { unregister() }
    OnDestroy { unregister() }
  }

  private fun register() {
    if (receiver != null) return
    val context = appContext.reactContext ?: return
    val next = object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
          sendEvent(BECOMING_NOISY, emptyMap<String, Any>())
        }
      }
    }
    // A protected system broadcast, so no export flag is needed (same as Media3's
    // AudioBecomingNoisyManager).
    context.registerReceiver(next, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY))
    receiver = next
  }

  private fun unregister() {
    val current = receiver ?: return
    receiver = null
    try {
      appContext.reactContext?.unregisterReceiver(current)
    } catch (_: IllegalArgumentException) {
      // Already unregistered.
    }
  }

  companion object {
    private const val BECOMING_NOISY = "onBecomingNoisy"
  }
}
