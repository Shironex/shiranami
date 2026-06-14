// N-API glue for the waveform addon. This header exposes only the registration
// entry point; the implementation (and the per-function glue) lives in the
// .cpp.
#pragma once

#include <napi.h>

namespace shiranami::waveform {

/**
 * Install the waveform addon's functions onto `exports` under a `waveform`
 * namespace, i.e. JS sees `addon.waveform.computePeaks` and
 * `addon.waveform.fromFile`. Called by the loader (addon.cpp).
 */
void Register(Napi::Env env, Napi::Object exports);

}  // namespace shiranami::waveform
