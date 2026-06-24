// Loader / entry point for Shiranami's native addons.
//
// One compiled binary (shiranami_native.node) hosts every native module. Each
// module lives in its own folder and exposes a `Register(env, exports)` that
// installs its namespace onto the shared exports object. JS then sees:
//
//   const native = require('shiranami_native.node');
//   native.waveform.fromFile(path, buckets);
//
// To add a future addon:
//   1. create src/native/<name>/<name>.hpp + .cpp with a Register() function,
//   2. add its core/ logic + .cpp sources to binding.gyp,
//   3. #include its header here and add one Register() line below.
#include <napi.h>

#include "waveform/waveform.hpp"
#include "loudness/loudness.hpp"  // Rung 2
#include "analysis/analysis.hpp"  // Rung 3 (BPM + musical key)

namespace {

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  shiranami::waveform::Register(env, exports);
  shiranami::loudness::Register(env, exports);
  shiranami::analysis::Register(env, exports);
  return exports;
}

}  // namespace

// The module name must match `target_name` in binding.gyp ("shiranami_native").
NODE_API_MODULE(shiranami_native, Init)
