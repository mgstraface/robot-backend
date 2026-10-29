import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name} (ver .env.example)`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT || 4100),
  // "prod" o "dev" (el panel muestra un aviso cuando es el entorno de pruebas)
  appEnv: process.env.APP_ENV || 'prod',
  mongoUri: required('MONGO_URI'),

  // Token para el panel (frontend) y para el robot (ESP32). Usá valores largos y distintos.
  adminToken: required('ADMIN_TOKEN'),
  deviceToken: required('DEVICE_TOKEN'),

  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    // Haiku es el más rápido: para una mascota que habla, la latencia importa más que la profundidad.
    model: process.env.CLAUDE_MODEL || 'claude-haiku-5-5',
    maxTokens: Number(process.env.CLAUDE_MAX_TOKENS || 300),
    historyLimit: Number(process.env.HISTORY_LIMIT || 12),
  },

  voice: {
    // "openai" usa su API (pago). "local" usa el servicio "voz" del VPS (gratis: Whisper + Piper).
    // "none" = el robot recibe solo texto.
    provider: process.env.VOICE_PROVIDER || 'none',
    openaiApiKey: process.env.OPENAI_API_KEY,
    localUrl: process.env.VOICE_LOCAL_URL || 'http://voz:8000/v1',
    sttModel: process.env.STT_MODEL || (process.env.VOICE_PROVIDER === 'local' ? 'Systran/faster-whisper-small' : 'gpt-4o-mini-transcribe'),
    ttsModel: process.env.TTS_MODEL || 'gpt-4o-mini-tts',
    ttsVoice: process.env.TTS_VOICE || 'alloy',
    language: process.env.VOICE_LANGUAGE || 'es',
    // Formato del audio que manda el robot (PCM crudo desde el INMP441)
    inputSampleRate: Number(process.env.INPUT_SAMPLE_RATE || 16000),
    // El TTS de OpenAI en formato "pcm" devuelve 24 kHz, 16 bits, mono
    outputSampleRate: 24000,
    maxListenSeconds: Number(process.env.MAX_LISTEN_SECONDS || 30),
  },
};
