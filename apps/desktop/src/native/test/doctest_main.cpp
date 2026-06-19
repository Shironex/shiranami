// Entry point for the native C++ unit tests.
//
// doctest is a single-header framework (vendor/doctest/doctest.h). Exactly ONE
// translation unit must define the implementation; we do it here with our own
// main() (DOCTEST_CONFIG_IMPLEMENT, not ..._WITH_MAIN) so doctest still parses
// its own command-line flags normally. The actual TEST_CASEs live in the
// sibling test_*.cpp files — doctest auto-registers them at static-init time,
// so no manual registration is needed here.
#define DOCTEST_CONFIG_IMPLEMENT
#include "vendor/doctest/doctest.h"

int main(int argc, char** argv) {
  doctest::Context context;
  context.applyCommandLine(argc, argv);
  return context.run();
}
