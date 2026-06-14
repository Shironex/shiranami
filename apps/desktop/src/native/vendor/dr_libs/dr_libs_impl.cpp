// Single translation unit that compiles the dr_libs decoder implementations.
//
// Defining *_IMPLEMENTATION in exactly ONE source file emits the actual decoder
// code; every other file that includes these headers sees only declarations.
// Keeping the (large) implementations isolated here means editing the addon
// glue or core never recompiles the decoders. The headers are siblings of this
// file, so the includes are unqualified.
#define DR_WAV_IMPLEMENTATION
#define DR_FLAC_IMPLEMENTATION
#define DR_MP3_IMPLEMENTATION
#include "dr_wav.h"
#include "dr_flac.h"
#include "dr_mp3.h"
