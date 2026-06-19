// Loudness addon — the N-API ADAPTER layer. Its only job is translating between
// JS values and the pure C++ core (core/loudness, which reuses
// core/audio_decoder). No DSP or memory management lives here; that's all in
// core/, callable without a JS engine.
#include "loudness/loudness.hpp"

#include "core/loudness.hpp"

namespace shiranami::loudness {

namespace {

// fromFile(path: string) -> one of:
//   { status: 'ok', lufs: number }   measured a usable value
//   { status: 'silent' }             decoded but non-finite loudness (skip)
//   { status: 'undecodable' }        can't decode -> JS falls back to ffmpeg
//
// Returns a discriminated object rather than a bare number so the JS caller can
// tell "measured a value" from "decoded but silent" from "can't decode this
// format" — the last of which triggers the ffmpeg fallback on the JS side. See
// core/loudness.hpp for why those three outcomes stay distinct.
Napi::Value FromFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected (string path)")
        .ThrowAsJavaScriptException();
    return env.Null();
  }
  std::string path = info[0].As<Napi::String>().Utf8Value();

  audio::LoudnessResult result = audio::measureIntegratedLoudness(path);

  Napi::Object out = Napi::Object::New(env);
  switch (result.status) {
    case audio::LoudnessStatus::Ok:
      out.Set("status", Napi::String::New(env, "ok"));
      out.Set("lufs", Napi::Number::New(env, result.lufs));
      break;
    case audio::LoudnessStatus::Silent:
      out.Set("status", Napi::String::New(env, "silent"));
      break;
    case audio::LoudnessStatus::Undecodable:
      out.Set("status", Napi::String::New(env, "undecodable"));
      break;
  }
  return out;
}

}  // namespace

void Register(Napi::Env env, Napi::Object exports) {
  Napi::Object ns = Napi::Object::New(env);
  ns.Set("fromFile", Napi::Function::New(env, FromFile));
  exports.Set("loudness", ns);
}

}  // namespace shiranami::loudness
