package expo.modules.audiolibrary

import android.Manifest
import android.content.ContentUris
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.concurrent.Callable
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * The music on the phone: MediaStore listing, the audio permission, and
 * reading tags, artwork and the content hash of a batch of files.
 */
class AudioLibraryModule : Module() {
  /** Files are read a few at a time; most of the cost is waiting on storage. */
  private val pool: ExecutorService by lazy {
    Executors.newFixedThreadPool(Runtime.getRuntime().availableProcessors().coerceIn(2, 4))
  }

  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("AudioLibrary")

    AsyncFunction("getPermissionAsync") { promise: Promise ->
      Permissions.getPermissionsWithPermissionsManager(appContext.permissions, promise, audioPermission())
    }

    AsyncFunction("requestPermissionAsync") { promise: Promise ->
      Permissions.askForPermissionsWithPermissionsManager(appContext.permissions, promise, audioPermission())
    }

    AsyncFunction("queryAudioAsync") {
      queryAudio()
    }

    AsyncFunction("readTracksAsync") { uris: List<String>, artDir: String ->
      val dir = File(artDir.removePrefix("file://"))
      val reader = TrackReader(context)
      val tasks = uris.map { uri -> Callable { reader.read(Uri.parse(uri), dir)?.toMap() } }
      pool.invokeAll(tasks).map { future ->
        try {
          future.get()
        } catch (_: Exception) {
          null
        }
      }
    }

    OnDestroy { pool.shutdown() }
  }

  /** READ_MEDIA_AUDIO from Android 13; the storage permission before it. */
  private fun audioPermission(): String =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      Manifest.permission.READ_MEDIA_AUDIO
    } else {
      Manifest.permission.READ_EXTERNAL_STORAGE
    }

  /** Every file MediaStore flags as music, with what a rescan needs to spot a change. */
  private fun queryAudio(): List<Map<String, Any?>> {
    val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
    } else {
      MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
    }
    val projection = arrayOf(
      MediaStore.Audio.Media._ID,
      MediaStore.Audio.Media.DISPLAY_NAME,
      MediaStore.Audio.Media.SIZE,
      MediaStore.Audio.Media.DATE_MODIFIED,
      MediaStore.Audio.Media.MIME_TYPE,
    )
    val found = mutableListOf<Map<String, Any?>>()
    context.contentResolver.query(
      collection,
      projection,
      "${MediaStore.Audio.Media.IS_MUSIC} != 0",
      null,
      "${MediaStore.Audio.Media._ID} ASC",
    )?.use { cursor ->
      val id = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
      val name = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)
      val size = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE)
      val modified = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_MODIFIED)
      val mime = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.MIME_TYPE)
      while (cursor.moveToNext()) {
        found += mapOf(
          "uri" to ContentUris.withAppendedId(collection, cursor.getLong(id)).toString(),
          "name" to (cursor.getString(name) ?: ""),
          "size" to cursor.getLong(size).toDouble(),
          "modified" to cursor.getLong(modified).toDouble(),
          "mimeType" to cursor.getString(mime),
        )
      }
    }
    return found
  }
}
