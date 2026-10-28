import { config } from '../config.js';

export function voiceEnabled() {
  return config.voice.provider === 'openai' && Boolean(config.voice.openaiApiKey);
}

/** Envuelve PCM crudo (16 bits, mono) en un WAV para mandarlo al servicio de transcripción. */
export function pcmToWav(pcm, sampleRate, channels = 1, bitsPerSample = 16) {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Audio del robot (PCM 16 kHz) → texto. */
export async function transcribe(pcm) {
  if (!voiceEnabled()) throw new Error('Voz desactivada: configurá VOICE_PROVIDER=openai y OPENAI_API_KEY');
  const wav = pcmToWav(pcm, config.voice.inputSampleRate);
  const form = new FormData();
  form.append('file', new Blob([wav], { type: 'audio/wav' }), 'audio.wav');
  form.append('model', config.voice.sttModel);
  form.append('language', config.voice.language);

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.voice.openaiApiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Transcripción falló (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return String(data.text || '').trim();
}

/** Texto → audio PCM 24 kHz, 16 bits, mono (listo para mandar al MAX98357A por I2S). */
export async function synthesize(text) {
  if (!voiceEnabled()) throw new Error('Voz desactivada: configurá VOICE_PROVIDER=openai y OPENAI_API_KEY');
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.voice.openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.voice.ttsModel,
      voice: config.voice.ttsVoice,
      input: text,
      response_format: 'pcm',
    }),
  });
  if (!res.ok) throw new Error(`Síntesis de voz falló (${res.status}): ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}
