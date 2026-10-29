import { config } from '../config.js';

export function voiceEnabled() {
  if (config.voice.provider === 'local') return true;
  return config.voice.provider === 'openai' && Boolean(config.voice.openaiApiKey);
}

// OpenAI o el servicio local (misma API, sin clave)
function endpoint(path) {
  const local = config.voice.provider === 'local';
  return {
    url: `${local ? config.voice.localUrl : 'https://api.openai.com/v1'}${path}`,
    headers: local ? {} : { Authorization: `Bearer ${config.voice.openaiApiKey}` },
  };
}

/** Saca el PCM (16 bits) y la frecuencia de un WAV. */
export function wavToPcm(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error('El audio no es WAV');
  let off = 12;
  let sampleRate = 0;
  let channels = 1;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    let size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(off + 10);
      sampleRate = buf.readUInt32LE(off + 12);
    } else if (id === 'data') {
      if (size === 0 || size === 0xffffffff || off + 8 + size > buf.length) size = buf.length - off - 8; // WAV en streaming
      let pcm = buf.subarray(off + 8, off + 8 + size);
      if (channels === 2) pcm = toMono(pcm);
      return { pcm, sampleRate };
    }
    off += 8 + size + (size % 2);
  }
  throw new Error('WAV sin datos');
}

function toMono(pcm) {
  const out = Buffer.alloc(Math.floor(pcm.length / 4) * 2);
  for (let i = 0, j = 0; j < out.length; i += 4, j += 2) out.writeInt16LE((pcm.readInt16LE(i) + pcm.readInt16LE(i + 2)) >> 1, j);
  return out;
}

/** Cambia la frecuencia de PCM 16 bits mono (interpolación lineal; alcanza para un parlante chico). */
export function resample(pcm, from, to) {
  if (from === to) return pcm;
  const n = Math.floor(pcm.length / 2);
  const m = Math.floor((n * to) / from);
  const out = Buffer.alloc(m * 2);
  for (let i = 0; i < m; i++) {
    const x = (i * from) / to;
    const a = Math.floor(x);
    const b = Math.min(a + 1, n - 1);
    const t = x - a;
    out.writeInt16LE(Math.round(pcm.readInt16LE(a * 2) * (1 - t) + pcm.readInt16LE(b * 2) * t), i * 2);
  }
  return out;
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
  if (!voiceEnabled()) throw new Error('Voz desactivada: configurá VOICE_PROVIDER (local u openai)');
  const wav = pcmToWav(pcm, config.voice.inputSampleRate);
  const form = new FormData();
  form.append('file', new Blob([wav], { type: 'audio/wav' }), 'audio.wav');
  form.append('model', config.voice.sttModel);
  form.append('language', config.voice.language);

  const { url, headers } = endpoint('/audio/transcriptions');
  const res = await fetch(url, { method: 'POST', headers, body: form });
  if (!res.ok) throw new Error(`Transcripción falló (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return String(data.text || '').trim();
}

/** Texto → audio PCM 24 kHz, 16 bits, mono (listo para mandar al MAX98357A por I2S). */
export async function synthesize(text) {
  if (!voiceEnabled()) throw new Error('Voz desactivada: configurá VOICE_PROVIDER (local u openai)');
  const local = config.voice.provider === 'local';
  const { url, headers } = endpoint('/audio/speech');
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.voice.ttsModel,
      voice: config.voice.ttsVoice,
      input: text,
      // la voz local (Piper) habla a 22 kHz: pedimos WAV para saber la frecuencia y la pasamos a 24 kHz
      response_format: local ? 'wav' : 'pcm',
    }),
  });
  if (!res.ok) throw new Error(`Síntesis de voz falló (${res.status}): ${await res.text()}`);
  const audio = Buffer.from(await res.arrayBuffer());
  if (!local) return audio;
  const { pcm, sampleRate } = wavToPcm(audio);
  return resample(pcm, sampleRate, config.voice.outputSampleRate);
}
