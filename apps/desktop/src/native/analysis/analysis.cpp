// Analysis addon — the N-API ADAPTER layer (BPM + musical key). Its only job is
// translating between JS values and the pure C++ core (core/analysis, which
// decodes once and reuses core/tempo + core/key). No DSP lives here; that's all
// in core/, callable without a JS engine.
#include "analysis/analysis.hpp"

#include "core/analysis.hpp"

namespace shiranami::analysis {

namespace {

// fromFile(path: string) -> one of:
//   { status: 'ok', bpm: number, key: string }   decoded; bpm 0 / key '' when
//                                                 that dimension was
//                                                 undetectable
//   { status: 'unanalyzable' }                    can't decode this format
//
// A discriminated object (not a bare {bpm, key}) lets the JS caller tell "we
// decoded the file" from "we can't read this format", matching the loudness
// addon's contract. The service maps bpm 0 / empty key onto null per-field.
Napi::Value FromFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected (string path)")
        .ThrowAsJavaScriptException();
    return env.Null();
  }
  std::string path = info[0].As<Napi::String>().Utf8Value();

  audio::AnalysisResult result = audio::analyzeAudioFile(path);

  Napi::Object out = Napi::Object::New(env);
  switch (result.status) {
    case audio::AnalysisStatus::Ok:
      out.Set("status", Napi::String::New(env, "ok"));
      out.Set("bpm", Napi::Number::New(env, result.bpm));
      out.Set("key", Napi::String::New(env, result.key));
      break;
    case audio::AnalysisStatus::Unanalyzable:
      out.Set("status", Napi::String::New(env, "unanalyzable"));
      break;
  }
  return out;
}

}  // namespace

void Register(Napi::Env env, Napi::Object exports) {
  Napi::Object ns = Napi::Object::New(env);
  ns.Set("fromFile", Napi::Function::New(env, FromFile));
  exports.Set("analysis", ns);
}

}  // namespace shiranami::analysis
