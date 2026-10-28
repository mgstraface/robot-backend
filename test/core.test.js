process.env.MONGO_URI ||= 'mongodb://127.0.0.1:27017/robot-test';
process.env.ADMIN_TOKEN ||= 'test-admin';
process.env.DEVICE_TOKEN ||= 'test-device';

import assert from 'node:assert/strict';
import { test } from 'node:test';

const { parseEmotion } = await import('../src/emotions.js');
const { buildHistory, buildSystemPrompt } = await import('../src/services/ai.js');
const { pcmToWav } = await import('../src/services/voice.js');

test('parseEmotion separa la emoción del texto', () => {
  assert.deepEqual(parseEmotion('[feliz] ¡Hola Mati!'), { emotion: 'feliz', text: '¡Hola Mati!' });
  assert.deepEqual(parseEmotion('[SORPRENDIDO]  ¿En serio?'), { emotion: 'sorprendido', text: '¿En serio?' });
});

test('parseEmotion usa neutral si falta o no es válida', () => {
  assert.deepEqual(parseEmotion('Hola'), { emotion: 'neutral', text: 'Hola' });
  assert.deepEqual(parseEmotion('[pensando] mmm'), { emotion: 'neutral', text: 'mmm' });
});

test('buildHistory arranca con user y alterna roles', () => {
  const history = buildHistory([
    { role: 'assistant', text: 'huérfano' },
    { role: 'user', text: 'hola' },
    { role: 'user', text: 'estás?' },
    { role: 'assistant', text: 'sí' },
    { role: 'user', text: 'genial' },
  ]);
  assert.deepEqual(history, [
    { role: 'user', content: 'hola\nestás?' },
    { role: 'assistant', content: 'sí' },
    { role: 'user', content: 'genial' },
  ]);
});

test('buildSystemPrompt incluye personalidad, fecha y formato de emoción', () => {
  const prompt = buildSystemPrompt({ systemPrompt: 'Sos Robi.' }, new Date('2026-10-28T18:00:00Z'));
  assert.match(prompt, /^Sos Robi\./);
  assert.match(prompt, /2026/);
  assert.match(prompt, /\[feliz\]/);
});

test('pcmToWav arma un header WAV válido', () => {
  const pcm = Buffer.alloc(3200);
  const wav = pcmToWav(pcm, 16000);
  assert.equal(wav.length, 44 + 3200);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.readUInt32LE(40), 3200);
});
