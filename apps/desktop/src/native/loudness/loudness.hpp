// N-API glue for the loudness addon. This header exposes only the registration
// entry point; the per-function glue lives in the .cpp.
#pragma once

#include <napi.h>

namespace shiranami::loudness {

/**
 * Install the loudness addon's functions onto `exports` under a `loudness`
 * namespace, i.e. JS sees `addon.loudness.fromFile(path)`. Called by the loader
 * (addon.cpp).
 */
void Register(Napi::Env env, Napi::Object exports);

}  // namespace shiranami::loudness
