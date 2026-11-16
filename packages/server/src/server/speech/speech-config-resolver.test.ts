import path from "node:path";

import { describe, expect, test } from "vitest";

import { PersistedConfigSchema } from "../persisted-config.js";
import { resolveSpeechConfig } from "./speech-config-resolver.js";

describe("resolveSpeechConfig", () => {
  test("resolves local-first defaults with voice mode off until turned on", () => {
    const zenticHome = "/tmp/zentic-home";
    const persisted = PersistedConfigSchema.parse({});
    const env = {} as NodeJS.ProcessEnv;

    const result = resolveSpeechConfig({
      zenticHome,
      env,
      persisted,
    });

    expect(result.openai).toBeUndefined();
    expect(result.speech.providers.dictationStt).toEqual({
      provider: "local",
      explicit: false,
      enabled: true,
    });
    expect(result.speech.providers.voiceTurnDetection).toEqual({
      provider: "local",
      explicit: false,
      enabled: false,
    });
    expect(result.speech.providers.voiceStt).toEqual({
      provider: "local",
      explicit: false,
      enabled: false,
    });
    expect(result.speech.providers.voiceTts).toEqual({
      provider: "local",
      explicit: false,
      enabled: false,
    });
    expect(result.speech.local).toEqual({
      modelsDir: path.join(zenticHome, "models", "local-speech"),
      models: {
        dictationStt: "parakeet-tdt-0.6b-v2-int8",
        voiceStt: "parakeet-tdt-0.6b-v2-int8",
        voiceTts: "kokoro-en-v0_19",
        voiceTtsSpeakerId: 0,
      },
    });
    expect(result.speech.local?.models.dictationStt).toBe("parakeet-tdt-0.6b-v2-int8");
    expect(result.speech.local?.models.voiceStt).toBe("parakeet-tdt-0.6b-v2-int8");
    expect(result.speech.local?.models.voiceTts).toBe("kokoro-en-v0_19");
    expect(result.speech.local?.models.voiceTtsSpeakerId).toBe(0);
    expect(result.speech.sttLanguages).toEqual({
      dictation: "en",
      voice: "en",
    });
  });

  test("resolves feature-scoped local speech settings", () => {
    const persisted = PersistedConfigSchema.parse({
      features: {
        voiceMode: {
          enabled: true,
          turnDetection: { provider: "local" },
          stt: { provider: "openai", apiKey: "persisted-key", model: "gpt-4o-transcribe" },
        },
      },
    });
    const env = {
      ZENTIC_DICTATION_LOCAL_STT_MODEL: "parakeet-tdt-0.6b-v2-int8",
      ZENTIC_VOICE_LOCAL_STT_MODEL: "parakeet-tdt-0.6b-v2-int8",
      ZENTIC_VOICE_LOCAL_TTS_MODEL: "kokoro-en-v0_19",
      ZENTIC_VOICE_LOCAL_TTS_SPEAKER_ID: "5",
      ZENTIC_VOICE_LOCAL_TTS_SPEED: "1.35",
      ZENTIC_DICTATION_LANGUAGE: "es",
      ZENTIC_VOICE_LANGUAGE: "pt",
      ZENTIC_LOCAL_MODELS_DIR: "/tmp/models",
      OPENAI_API_KEY: "env-key",
      ZENTIC_VOICE_STT_PROVIDER: "openai",
      ZENTIC_DICTATION_STT_PROVIDER: "local",
      ZENTIC_VOICE_TTS_PROVIDER: "local",
    } as NodeJS.ProcessEnv;

    const result = resolveSpeechConfig({
      zenticHome: "/tmp/zentic-home",
      env,
      persisted,
    });

    expect(result.speech.local).toEqual({
      modelsDir: "/tmp/models",
      models: {
        dictationStt: "parakeet-tdt-0.6b-v2-int8",
        voiceStt: "parakeet-tdt-0.6b-v2-int8",
        voiceTts: "kokoro-en-v0_19",
        voiceTtsSpeakerId: 5,
        voiceTtsSpeed: 1.35,
      },
    });
    expect(result.speech.providers.dictationStt).toEqual({
      provider: "local",
      explicit: true,
      enabled: true,
    });
    expect(result.speech.providers.voiceStt).toEqual({
      provider: "openai",
      explicit: true,
      enabled: true,
    });
    expect(result.speech.providers.voiceTurnDetection).toEqual({
      provider: "local",
      explicit: true,
      enabled: true,
    });
    expect(result.speech.providers.voiceTts).toEqual({
      provider: "local",
      explicit: true,
      enabled: true,
    });
    expect(result.speech.local?.models.dictationStt).toBe("parakeet-tdt-0.6b-v2-int8");
    expect(result.speech.local?.models.voiceStt).toBe("parakeet-tdt-0.6b-v2-int8");
    expect(result.speech.local?.models.voiceTts).toBe("kokoro-en-v0_19");
    expect(result.speech.local?.models.voiceTtsSpeakerId).toBe(5);
    expect(result.speech.local?.models.voiceTtsSpeed).toBe(1.35);
    expect(result.speech.sttLanguages).toEqual({
      dictation: "es",
      voice: "pt",
    });
    expect(result.openai?.stt?.apiKey).toBe("persisted-key");
    expect(result.openai?.tts?.apiKey).toBe("env-key");
    expect(result.openai?.stt?.model).toBe("gpt-4o-transcribe");
  });

  test.each(["local", "openai"])(
    "resolves STT language from env, settings, and voice-to-dictation fallback (%s)",
    (provider) => {
      const persisted = PersistedConfigSchema.parse({
        features: {
          dictation: {
            stt: {
              provider,
              language: "fr",
            },
          },
          voiceMode: {
            stt: {
              provider,
              language: "de",
            },
          },
        },
      });

      const result = resolveSpeechConfig({
        zenticHome: "/tmp/zentic-home",
        env: {
          ZENTIC_DICTATION_LANGUAGE: "es",
          ZENTIC_VOICE_LANGUAGE: "  ",
        } as NodeJS.ProcessEnv,
        persisted,
      });

      expect(result.speech.sttLanguages).toEqual({
        dictation: "es",
        voice: "es",
      });
    },
  );

  test("includes local provider config for local turn detection with OpenAI voice STT/TTS", () => {
    const persisted = PersistedConfigSchema.parse({
      features: {
        dictation: { enabled: false },
        voiceMode: {
          enabled: true,
          stt: { provider: "openai", apiKey: "test-key", model: "gpt-4o-transcribe" },
          tts: { provider: "openai", apiKey: "test-key", model: "gpt-4o-mini-tts", voice: "alloy" },
        },
      },
    });

    const result = resolveSpeechConfig({
      zenticHome: "/tmp/zentic-home",
      env: {} as NodeJS.ProcessEnv,
      persisted,
    });

    expect(result.speech.providers.voiceTurnDetection).toEqual({
      provider: "local",
      explicit: false,
      enabled: true,
    });
    expect(result.speech.providers.voiceStt).toEqual({
      provider: "openai",
      explicit: true,
      enabled: true,
    });
    expect(result.speech.providers.voiceTts).toEqual({
      provider: "openai",
      explicit: true,
      enabled: true,
    });
    expect(result.speech.providers.dictationStt).toEqual({
      provider: "local",
      explicit: false,
      enabled: false,
    });
    // Turn detection is always local, so the local provider config must be
    // present even when no speech site uses the local provider and no
    // models directory is configured; otherwise voice mode reports
    // turn_detection_unavailable.
    expect(result.speech.local).toEqual({
      modelsDir: path.join("/tmp/zentic-home", "models", "local-speech"),
      models: {
        dictationStt: "parakeet-tdt-0.6b-v2-int8",
        voiceStt: "parakeet-tdt-0.6b-v2-int8",
        voiceTts: "kokoro-en-v0_19",
        voiceTtsSpeakerId: 0,
      },
    });
  });

  test("includes local provider config for local turn detection with dictation on OpenAI", () => {
    const persisted = PersistedConfigSchema.parse({
      features: {
        dictation: {
          enabled: true,
          stt: { provider: "openai", apiKey: "test-key", model: "gpt-4o-transcribe" },
        },
        voiceMode: {
          enabled: true,
          stt: { provider: "openai", apiKey: "test-key", model: "gpt-4o-transcribe" },
          tts: { provider: "openai", apiKey: "test-key", model: "gpt-4o-mini-tts", voice: "alloy" },
        },
      },
    });

    const result = resolveSpeechConfig({
      zenticHome: "/tmp/zentic-home",
      env: {} as NodeJS.ProcessEnv,
      persisted,
    });

    expect(result.speech.providers.voiceTurnDetection).toEqual({
      provider: "local",
      explicit: false,
      enabled: true,
    });
    expect(result.speech.local).toEqual({
      modelsDir: path.join("/tmp/zentic-home", "models", "local-speech"),
      models: {
        dictationStt: "parakeet-tdt-0.6b-v2-int8",
        voiceStt: "parakeet-tdt-0.6b-v2-int8",
        voiceTts: "kokoro-en-v0_19",
        voiceTtsSpeakerId: 0,
      },
    });
  });

  test("omits local provider config when voice mode is off and no speech site is local", () => {
    const persisted = PersistedConfigSchema.parse({
      features: {
        dictation: { enabled: false },
        voiceMode: {
          enabled: false,
          stt: { provider: "openai", apiKey: "test-key", model: "gpt-4o-transcribe" },
          tts: { provider: "openai", apiKey: "test-key", model: "gpt-4o-mini-tts", voice: "alloy" },
        },
      },
    });

    const result = resolveSpeechConfig({
      zenticHome: "/tmp/zentic-home",
      env: {} as NodeJS.ProcessEnv,
      persisted,
    });

    expect(result.speech.providers.voiceTurnDetection).toEqual({
      provider: "local",
      explicit: false,
      enabled: false,
    });
    expect(result.speech.local).toBeUndefined();
  });

  test("respects disabled dictation and voice mode feature flags", () => {
    const persisted = PersistedConfigSchema.parse({
      features: {
        dictation: { enabled: false },
        voiceMode: { enabled: false },
      },
    });

    const result = resolveSpeechConfig({
      zenticHome: "/tmp/zentic-home",
      env: {} as NodeJS.ProcessEnv,
      persisted,
    });

    expect(result.speech.providers.dictationStt).toEqual({
      provider: "local",
      explicit: false,
      enabled: false,
    });
    expect(result.speech.providers.voiceTurnDetection).toEqual({
      provider: "local",
      explicit: false,
      enabled: false,
    });
    expect(result.speech.providers.voiceStt).toEqual({
      provider: "local",
      explicit: false,
      enabled: false,
    });
    expect(result.speech.providers.voiceTts).toEqual({
      provider: "local",
      explicit: false,
      enabled: false,
    });
  });
});
