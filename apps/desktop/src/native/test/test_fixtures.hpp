// Shared helper for the C++ unit tests: resolve a fixture audio file by name.
//
// The C++ test binary has no idea where the repo lives, so the test runner
// (scripts/native-test.mjs) passes the absolute fixtures directory through the
// `SHIRANAMI_FIXTURE_DIR` environment variable. We read it here rather than
// through argv so doctest keeps full control of the command line (its own
// filter/flag parsing). Falls back to a relative "fixtures" path so the binary
// is still runnable by hand from src/native/test/.
#pragma once

#include <cstdlib>
#include <string>

namespace shiranami::test {

inline std::string fixturePath(const std::string& name) {
  const char* dir = std::getenv("SHIRANAMI_FIXTURE_DIR");
  std::string base = (dir != nullptr && dir[0] != '\0') ? dir : "fixtures";
  return base + "/" + name;
}

}  // namespace shiranami::test
