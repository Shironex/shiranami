// Waveform addon — the N-API ADAPTER layer. Its only job is translating between
// JS values and the pure C++ core (core/audio_decoder + core/peaks). No DSP or
// memory management lives here; that's all in core/, callable without a JS
// engine.
#include "waveform/waveform.hpp"

#include "core/audio_decoder.hpp"
#include "core/peaks.hpp"

namespace shiranami::waveform {

namespace {

// computePeaks(samples: Float32Array, buckets: number): Float32Array
//
// Reduce a JS-provided mono sample array to peaks. Handy on its own and the
// path the (future) ffmpeg fallback would feed if we ever decode in JS.
Napi::Value ComputePeaks(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsTypedArray() || !info[1].IsNumber()) {
    Napi::TypeError::New(env, "Expected (Float32Array samples, number buckets)")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Float32Array samples = info[0].As<Napi::Float32Array>();
  int buckets = info[1].As<Napi::Number>().Int32Value();
  if (buckets <= 0) {
    Napi::RangeError::New(env, "buckets must be > 0")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Float32Array peaks = Napi::Float32Array::New(env, buckets);
  audio::reducePeaks(samples.Data(), samples.ElementLength(), /*channels=*/1,
                     buckets, peaks.Data());
  return peaks;
}

// fromFile(path: string, buckets: number)
//   -> { peaks: Float32Array, durationSec, sampleRate, channels } | null
//
// Decode a file natively and reduce it to peaks. Returns null when the file is
// missing or its format can't be decoded.
Napi::Value FromFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsNumber()) {
    Napi::TypeError::New(env, "Expected (string path, number buckets)")
        .ThrowAsJavaScriptException();
    return env.Null();
  }
  std::string path = info[0].As<Napi::String>().Utf8Value();
  int buckets = info[1].As<Napi::Number>().Int32Value();
  if (buckets <= 0) {
    Napi::RangeError::New(env, "buckets must be > 0")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  // The decoder owns its buffer and frees it when `decoded` leaves this scope —
  // no manual free, no leak on the early-return below.
  audio::DecodedAudio decoded = audio::decodeAudioFile(path);
  if (!decoded.ok()) {
    return env.Null();  // unsupported format / read error -> caller falls back
  }

  Napi::Float32Array peaks = Napi::Float32Array::New(env, buckets);
  audio::reducePeaks(decoded.samples,
                     static_cast<std::size_t>(decoded.frameCount),
                     decoded.channels, buckets, peaks.Data());

  Napi::Object result = Napi::Object::New(env);
  result.Set("peaks", peaks);
  result.Set("sampleRate", Napi::Number::New(env, decoded.sampleRate));
  result.Set("channels", Napi::Number::New(env, decoded.channels));
  result.Set(
      "durationSec",
      Napi::Number::New(env, static_cast<double>(decoded.frameCount) /
                                 static_cast<double>(decoded.sampleRate)));
  return result;
}

}  // namespace

void Register(Napi::Env env, Napi::Object exports) {
  Napi::Object ns = Napi::Object::New(env);
  ns.Set("computePeaks", Napi::Function::New(env, ComputePeaks));
  ns.Set("fromFile", Napi::Function::New(env, FromFile));
  exports.Set("waveform", ns);
}

}  // namespace shiranami::waveform
