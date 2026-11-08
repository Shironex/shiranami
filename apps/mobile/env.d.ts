// Expo's ambient types: `.css` and asset imports plus `process.env.EXPO_PUBLIC_*`.
/// <reference types="expo/types" />

// Only lib/env.ts reads these; .env.example documents them.
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_URL?: string;
    EXPO_PUBLIC_API_KEY?: string;
    EXPO_PUBLIC_FEATURE_YOUTUBE_SEARCH?: string;
  }
}
