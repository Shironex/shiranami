// N-API glue for the analysis addon (BPM + musical key). This header exposes
// only the registration entry point; the per-function glue lives in the .cpp.
#pragma once

#include <napi.h>

namespace shiranami::analysis {

/**
 * Install the analysis addon's functions onto `exports` under an `analysis`
 * namespace, i.e. JS sees `addon.analysis.fromFile(path)`. Called by the loader
 * (addon.cpp).
 */
void Register(Napi::Env env, Napi::Object exports);

}  // namespace shiranami::analysis
