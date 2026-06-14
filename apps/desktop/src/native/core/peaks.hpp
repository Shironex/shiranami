// Pure C++ peak reduction — no N-API. Reusable by any addon (and unit-testable
// without a JS engine).
//
// `#pragma once` is the modern include guard: it tells the compiler to include
// this header at most once per translation unit, so declarations aren't
// duplicated if several files include it (directly or transitively).
#pragma once

#include <cstddef>
#include <cstdint>

namespace shiranami::audio {

/**
 * Reduce `frameCount` interleaved audio frames (`channels` samples per frame)
 * down to `buckets` peak values, written into `out` (length must be `buckets`).
 * Each output peak is the loudest absolute sample across every channel in that
 * bucket's slice; range is 0..1. Does not allocate.
 */
void reducePeaks(const float* frames, std::size_t frameCount,
                 std::uint32_t channels, int buckets, float* out);

}  // namespace shiranami::audio
