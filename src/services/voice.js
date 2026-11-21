import { spawn } from 'node:child_process';
import { config } from '../config.js';
import { getSettings } from '../models/Settings.js';
import { edgeSynthesize } from './edgeTts.js';

/** ¿Puede entender audio (voz → texto)? */
export function sttEnabled() {
  if (config.voice.provider === 'local') return true;
  return config.voice.provider === 'openai' && Boolean(config.voice.openaiApiKey);
}
export const voiceEnabled = sttEnabled;

/** ¿Puede hablar (texto → voz)? Por defecto sí, con las voces gratis de Edge. */
export function ttsEnabled() {
  const p = config.voice.ttsProvider;
  if (p === 'edge' || p === 'local') return true;
  return p === 'openai' && Boolean(config.voice.openaiApiKey);
}

// Tono de la voz según el ajuste del panel
const TONOS = { normal: { pitch: '+0%', rate: '+0%' }, agudo: { pitch: '+18%', rate: '+5%' }, grave: { pitch: '-20%', rate: '-8%' } };

// OpenAI o el servicio local (misma API, sin clave)
function endpoint(path, local = config.voice.provider === 'local') {
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
export async function transcribe(pcm, sampleRate = config.voice.inputSampleRate) {
  if (!voiceEnabled()) throw new Error('Voz desactivada: configurá VOICE_PROVIDER (local u openai)');
  const wav = pcmToWav(pcm, sampleRate);
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

/** Audio en cualquier formato (webm/opus del navegador, mp4 del iPhone, wav…) → PCM 16 bits mono con ffmpeg. */
export function anyToPcm(data, sampleRate = config.voice.inputSampleRate) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-f', 's16le', '-ac', '1', '-ar', String(sampleRate), 'pipe:1']);
    const out = [];
    let err = '';
    const timer = setTimeout(() => {
      ff.kill('SIGKILL');
      reject(new Error('ffmpeg tardó demasiado'));
    }, 20000);
    ff.stdout.on('data', (c) => out.push(c));
    ff.stderr.on('data', (c) => (err += c));
    ff.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    ff.on('close', (code) => {
      clearTimeout(timer);
      const buf = Buffer.concat(out);
      code === 0 && buf.length ? resolve(buf) : reject(new Error(`ffmpeg salió con ${code}: ${err.trim().slice(0, 200)}`));
    });
    ff.stdin.on('error', () => {});
    ff.stdin.end(data);
  });
}

/** Igual que en el panel: que no deletree MAYÚSCULAS ni lea las risas como letras. */
export function forSpeech(text) {
  return String(text || '')
    .replace(/\b[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ']+\b/g, (w) => w.toLowerCase())
    .replace(/([a-záéíóúñ])\1{3,}/gi, '$1$1$1')
    .replace(/\b(j[aeiou])(?:[\s,.…]+\1)+\b/gi, (m, syl) => syl.toLowerCase().repeat(Math.min(4, m.split(/[\s,.…]+/).length)));
}

/**
 * Texto → audio, en el formato que dé el proveedor:
 * { format: 'mp3', data } con Edge, o { format: 'pcm', data, sampleRate } con OpenAI / local.
 */
export async function synthesizeAudio(text) {
  if (config.voice.ttsProvider === 'edge') {
    const s = await getSettings();
    return { format: 'mp3', data: await edgeSynthesize(forSpeech(text), { voice: s.voz, ...(TONOS[s.vozTono] || TONOS.normal) }) };
  }
  return { format: 'pcm', data: await synthesize(text), sampleRate: config.voice.outputSampleRate };
}

/** Texto → audio PCM 24 kHz, 16 bits, mono (listo para mandar al MAX98357A por I2S). */
export async function synthesize(text) {
  if (!ttsEnabled()) throw new Error('Voz desactivada: configurá TTS_PROVIDER');
  if (config.voice.ttsProvider === 'edge') throw new Error('Con Edge usá synthesizeAudio (devuelve MP3)');
  const local = config.voice.ttsProvider === 'local';
  const { url, headers } = endpoint('/audio/speech', local);
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.voice.ttsModel,
      voice: config.voice.ttsVoice,
      input: forSpeech(text),
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

/**
 * El robot no decodifica MP3: lo pasamos a PCM 16 bits mono con ffmpeg (24 kHz, como pide el parlante).
 * Si no hay ffmpeg o falla, devuelve el audio como vino.
 */
export async function audioForRobot(audio, sampleRate = 24000) {
  if (!audio || audio.format !== 'mp3') return audio;
  try {
    const pcm = await new Promise((resolve, reject) => {
      const ff = spawn('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-f', 's16le', '-ac', '1', '-ar', String(sampleRate), 'pipe:1']);
      const out = [];
      let err = '';
      const timer = setTimeout(() => {
        ff.kill('SIGKILL');
        reject(new Error('ffmpeg tardó demasiado'));
      }, 15000);
      ff.stdout.on('data', (c) => out.push(c));
      ff.stderr.on('data', (c) => (err += c));
      ff.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      ff.on('close', (code) => {
        clearTimeout(timer);
        const buf = Buffer.concat(out);
        code === 0 && buf.length ? resolve(buf) : reject(new Error(`ffmpeg salió con ${code} (mp3 de ${audio.data.length} bytes, empieza con ${audio.data.subarray(0, 4).toString('hex')}): ${err.trim().slice(0, 200)}`));
      });
      ff.stdin.on('error', () => {});
      ff.stdin.end(audio.data);
    });
    return { format: 'pcm', data: pcm, sampleRate };
  } catch (e) {
    console.error('[voz] no pude pasar el MP3 a PCM:', e.message);
    return audio;
  }
}

// ---- IMA ADPCM (4 bits por muestra): el audio viaja 4 veces más liviano por el WiFi flojo del robot
const IMA_STEPS = [7,8,9,10,11,12,13,14,16,17,19,21,23,25,28,31,34,37,41,45,50,55,60,66,73,80,88,97,107,118,130,143,157,173,190,209,230,253,279,307,337,371,408,449,494,544,598,658,724,796,876,963,1060,1166,1282,1411,1552,1707,1878,2066,2272,2499,2749,3024,3327,3660,4026,4428,4871,5358,5894,6484,7132,7845,8630,9493,10442,11487,12635,13899,15289,16818,18500,20350,22385,24623,27086,29794,32767];
const IMA_INDEX = [-1, -1, -1, -1, 2, 4, 6, 8];

/** PCM 16 bits mono → IMA ADPCM sin cabecera (predictor 0, índice 0; nibble bajo primero). */
export function pcmToAdpcm(pcm) {
  const n = Math.floor(pcm.length / 2);
  const out = Buffer.alloc(Math.ceil(n / 2));
  let pred = 0;
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const sample = pcm.readInt16LE(i * 2);
    let step = IMA_STEPS[idx];
    let diff = sample - pred;
    let code = 0;
    if (diff < 0) {
      code = 8;
      diff = -diff;
    }
    let vp = step >> 3;
    if (diff >= step) { code |= 4; diff -= step; vp += step; }
    step >>= 1;
    if (diff >= step) { code |= 2; diff -= step; vp += step; }
    step >>= 1;
    if (diff >= step) { code |= 1; vp += step; }
    pred = code & 8 ? pred - vp : pred + vp;
    pred = Math.max(-32768, Math.min(32767, pred));
    idx = Math.max(0, Math.min(88, idx + IMA_INDEX[code & 7]));
    if (i & 1) out[i >> 1] |= code << 4;
    else out[i >> 1] = code;
  }
  return out;
}

/** Los firmwares >= 0.9.0 entienden ADPCM. */
export function supportsAdpcm(firmware) {
  const [a = 0, b = 0] = String(firmware || '').split('.').map(Number);
  return a > 0 || b >= 9;
}

/** Deja el audio listo para este robot: ADPCM a 16 kHz si sabe decodificarlo, PCM 24 kHz si no. */
export async function audioForDevice(audio, firmware) {
  if (!supportsAdpcm(firmware)) return audioForRobot(audio);
  const a = await audioForRobot(audio, 16000);
  if (!a || a.format !== 'pcm') return a;
  const pcm = a.sampleRate && a.sampleRate !== 16000 ? resample(a.data, a.sampleRate, 16000) : a.data;
  return { format: 'adpcm', data: pcmToAdpcm(pcm), sampleRate: 16000, samples: Math.floor(pcm.length / 2) };
}
