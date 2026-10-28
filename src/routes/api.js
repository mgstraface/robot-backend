import crypto from 'node:crypto';
import { Router } from 'express';
import { config } from '../config.js';
import { EMOTIONS, isEmotion } from '../emotions.js';
import { Message } from '../models/Message.js';
import { getPersonality, updatePersonality } from '../models/Personality.js';
import { chat } from '../services/ai.js';
import { pcmToWav, synthesize, voiceEnabled } from '../services/voice.js';
import { listDevices, recentEvents, setEmotion, speak } from '../ws/robotSocket.js';

const router = Router();

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !safeEqual(token, config.adminToken)) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

router.get('/health', (req, res) => {
  res.json({ ok: true, service: 'robot-backend', time: new Date().toISOString() });
});

router.use(requireAdmin);

router.get('/config', (req, res) => {
  res.json({ model: config.ai.model, voice: voiceEnabled(), emotions: EMOTIONS });
});

router.get(
  '/personality',
  asyncRoute(async (req, res) => {
    res.json(await getPersonality());
  })
);

router.put(
  '/personality',
  asyncRoute(async (req, res) => {
    const { name, systemPrompt } = req.body || {};
    res.json(await updatePersonality({ name, systemPrompt }));
  })
);

router.get(
  '/messages',
  asyncRoute(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const filter = req.query.deviceId ? { deviceId: String(req.query.deviceId) } : {};
    const messages = await Message.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    res.json(messages.reverse());
  })
);

// Borra la memoria de conversación (de un dispositivo o de todos)
router.delete(
  '/messages',
  asyncRoute(async (req, res) => {
    const filter = req.query.deviceId ? { deviceId: String(req.query.deviceId) } : {};
    const { deletedCount } = await Message.deleteMany(filter);
    res.json({ deleted: deletedCount });
  })
);

router.get('/robot/status', (req, res) => {
  res.json({ devices: listDevices(), events: recentEvents() });
});

router.post('/robot/expression', (req, res) => {
  const { deviceId, emotion } = req.body || {};
  if (!isEmotion(emotion)) return res.status(400).json({ error: 'Emoción inválida', emotions: EMOTIONS });
  res.json({ sentTo: setEmotion(deviceId, emotion) });
});

router.post(
  '/robot/say',
  asyncRoute(async (req, res) => {
    const { deviceId, text, emotion = 'neutral' } = req.body || {};
    if (!String(text || '').trim()) return res.status(400).json({ error: 'Falta el texto' });
    if (!isEmotion(emotion)) return res.status(400).json({ error: 'Emoción inválida' });
    res.json({ sentTo: await speak(deviceId, String(text).trim(), emotion) });
  })
);

// Voz del servidor para escuchar en la PC (el panel la usa si VOICE_PROVIDER está configurado)
router.post(
  '/tts',
  asyncRoute(async (req, res) => {
    const text = String(req.body?.text || '').trim().slice(0, 1000);
    if (!text) return res.status(400).json({ error: 'Falta el texto' });
    if (!voiceEnabled()) return res.status(503).json({ error: 'Voz del servidor desactivada' });
    const wav = pcmToWav(await synthesize(text), config.voice.outputSampleRate);
    res.type('audio/wav').send(wav);
  })
);

// Chat desde el panel: sirve para probar la personalidad sin tener el hardware armado.
// Con "speakOn" se hace decir la respuesta a un robot conectado.
router.post(
  '/chat',
  asyncRoute(async (req, res) => {
    const { text, deviceId = 'panel', speakOn } = req.body || {};
    if (!String(text || '').trim()) return res.status(400).json({ error: 'Falta el texto' });
    const reply = await chat({ deviceId: String(deviceId), text, source: 'panel' });
    let sentTo = 0;
    if (speakOn) sentTo = await speak(String(speakOn), reply.text, reply.emotion);
    res.json({ ...reply, sentTo });
  })
);

export default router;
