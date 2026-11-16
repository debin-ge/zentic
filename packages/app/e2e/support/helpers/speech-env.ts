const LOCAL_SPEECH_ENV_KEYS = [
  "ZENTIC_LOCAL_MODELS_DIR",
  "ZENTIC_DICTATION_LOCAL_STT_MODEL",
  "ZENTIC_VOICE_LOCAL_STT_MODEL",
  "ZENTIC_VOICE_LOCAL_TTS_MODEL",
  "ZENTIC_VOICE_LOCAL_TTS_SPEAKER_ID",
  "ZENTIC_VOICE_LOCAL_TTS_SPEED",
] as const;

const DISABLED_E2E_SPEECH_ENV = {
  ZENTIC_DICTATION_ENABLED: "0",
  ZENTIC_VOICE_MODE_ENABLED: "0",
  ZENTIC_DICTATION_STT_PROVIDER: "openai",
  ZENTIC_VOICE_TURN_DETECTION_PROVIDER: "openai",
  ZENTIC_VOICE_STT_PROVIDER: "openai",
  ZENTIC_VOICE_TTS_PROVIDER: "openai",
} as const;

export function withDisabledE2ESpeechEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // Default app E2E does not cover speech flows; keep restarts from starting
  // background local-model downloads for unrelated tests.
  const next: NodeJS.ProcessEnv = {
    ...env,
    ...DISABLED_E2E_SPEECH_ENV,
  };

  for (const key of LOCAL_SPEECH_ENV_KEYS) {
    delete next[key];
  }

  return next;
}
