{
  "comment": "One binary hosts all of Shiranami's native addons. addon.cpp is the loader (NODE_API_MODULE); each module lives in its own folder with a thin N-API glue file over the pure C++ in core/. dr_libs (vendored, public-domain) decode wav/flac/mp3. Pure C++ + headers, so it builds identically on macOS, Windows, and Linux.",
  "targets": [
    {
      "target_name": "shiranami_native",
      "sources": [
        "src/native/addon.cpp",
        "src/native/core/peaks.cpp",
        "src/native/core/audio_decoder.cpp",
        "src/native/core/loudness.cpp",
        "src/native/waveform/waveform.cpp",
        "src/native/loudness/loudness.cpp",
        "src/native/vendor/dr_libs/dr_libs_impl.cpp",
        "src/native/vendor/libebur128/ebur128.c"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "src/native"
      ],
      "defines": ["NAPI_VERSION=8"],
      "conditions": [
        ["OS=='win'", {
          "comment": "libebur128's ebur128.c includes <sys/queue.h>, which exists on macOS/Linux but not MSVC. We ship a BSD sys/queue.h under vendor/libebur128/compat and add it to the include path on Windows only, so the other platforms keep using their system header (no patch to upstream). _USE_MATH_DEFINES exposes M_PI etc. on MSVC's <math.h>, which ebur128.c relies on.",
          "include_dirs": ["src/native/vendor/libebur128/compat"],
          "defines": ["_USE_MATH_DEFINES"]
        }]
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
        "MACOSX_DEPLOYMENT_TARGET": "11.0"
      },
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1,
          "AdditionalOptions": ["/std:c++17"]
        }
      }
    }
  ]
}
