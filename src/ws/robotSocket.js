import { WebSocketServer } from 'ws';
import { config } from '../config.js';
import { isEmotion, TOUCH_REACTIONS } from '../emotions.js';
import { appearanceOf, getPersonality } from '../models/Personality.js';
import { chat } from '../services/ai.js';
import { synthesize, transcribe, voiceEnabled } from '../services/voice.js';

/*
 * Protocolo robot ⇄ servidor (ver README para el detalle):
 *   Robot → servidor (JSON): hello, listen_start, listen_end, text, touch, ping
 *   Robot → servidor (binario): audio PCM 16 kHz / 16 bits / mono entre listen_start y listen_end
 *   Servidor → robot (JSON): welcome, appearance, emotion, transcript, reply, audio_start, audio_end, error, pong
 *   Servidor → robot (binario): audio PCM 24 kHz / 16 bits / mono entre audio_start y audio_end
 */

const AUDIO_CHUNK_BYTES = 4096;
const MAX_EVENTS = 50;

const devices = new Map(); // deviceId → { ws, connectedAt, lastSeen, busy, audio: Buffer[] , audioBytes }
const events = []; // últimos eventos, para mostrar en el panel

function logEvent(deviceId, type, detail = {}) {
  events.unshift({ at: new Date().toISOString(), deviceId, type, ...detail });
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
}

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

export function listDevices() {
  return [...devices.entries()].map(([deviceId, d]) => ({
    deviceId,
    connectedAt: d.connectedAt,
    lastSeen: d.lastSeen,
    busy: d.busy,
  }));
}

export function recentEvents() {
  return events;
}

function targets(deviceId) {
  if (deviceId) {
    const d = devices.get(deviceId);
    return d ? [[deviceId, d]] : [];
  }
  return [...devices.entries()];
}

/** Manda un mensaje a todos los robots conectados. Devuelve a cuántos llegó. */
export function broadcast(payload) {
  for (const [, d] of devices) send(d.ws, payload);
  return devices.size;
}

/** Cambia la cara del robot (o de todos si no se indica deviceId). Devuelve a cuántos llegó. */
export function setEmotion(deviceId, emotion) {
  if (!isEmotion(emotion)) throw new Error(`Emoción inválida: ${emotion}`);
  const list = targets(deviceId);
  for (const [id, d] of list) {
    send(d.ws, { type: 'emotion', emotion });
    logEvent(id, 'emotion', { emotion, from: 'panel' });
  }
  return list.length;
}

async function streamAudio(ws, pcm) {
  send(ws, { type: 'audio_start', sampleRate: config.voice.outputSampleRate, bytes: pcm.length });
  for (let i = 0; i < pcm.length; i += AUDIO_CHUNK_BYTES) {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(pcm.subarray(i, i + AUDIO_CHUNK_BYTES));
  }
  send(ws, { type: 'audio_end' });
}

/** Le hace decir un texto al robot, con emoción y (si hay voz configurada) audio. */
export async function speak(deviceId, text, emotion = 'neutral') {
  const list = targets(deviceId);
  if (list.length === 0) return 0;
  const audio = voiceEnabled() ? await synthesize(text) : null;
  for (const [id, d] of list) {
    send(d.ws, { type: 'reply', text, emotion });
    logEvent(id, 'reply', { text, emotion, from: 'panel' });
    if (audio) await streamAudio(d.ws, audio);
  }
  return list.length;
}

async function respond(deviceId, device, userText, source) {
  const { ws } = device;
  device.busy = true;
  try {
    send(ws, { type: 'emotion', emotion: 'pensando' });
    const { text, emotion } = await chat({ deviceId, text: userText, source });
    send(ws, { type: 'reply', text, emotion });
    logEvent(deviceId, 'reply', { text, emotion });
    if (voiceEnabled()) await streamAudio(ws, await synthesize(text));
  } finally {
    device.busy = false;
  }
}

async function handleJson(deviceId, device, msg) {
  const { ws } = device;
  switch (msg.type) {
    case 'hello':
      logEvent(deviceId, 'hello', { firmware: msg.firmware });
      return;

    case 'ping':
      send(ws, { type: 'pong' });
      return;

    case 'listen_start':
      device.audio = [];
      device.audioBytes = 0;
      device.listening = true;
      send(ws, { type: 'emotion', emotion: 'escuchando' });
      return;

    case 'listen_end': {
      device.listening = false;
      const pcm = Buffer.concat(device.audio || []);
      device.audio = [];
      device.audioBytes = 0;
      if (pcm.length < config.voice.inputSampleRate * 2 * 0.3) {
        // menos de 0,3 s: probablemente un toque sin querer
        send(ws, { type: 'emotion', emotion: 'neutral' });
        return;
      }
      send(ws, { type: 'emotion', emotion: 'pensando' });
      const transcript = await transcribe(pcm);
      send(ws, { type: 'transcript', text: transcript });
      logEvent(deviceId, 'transcript', { text: transcript });
      if (!transcript) {
        send(ws, { type: 'emotion', emotion: 'curioso' });
        return;
      }
      await respond(deviceId, device, transcript, 'voice');
      return;
    }

    case 'text': {
      const text = String(msg.text || '').trim();
      if (!text) return;
      logEvent(deviceId, 'text', { text });
      await respond(deviceId, device, text, 'text');
      return;
    }

    case 'touch': {
      const zone = String(msg.zone || 'cabeza');
      const emotion = TOUCH_REACTIONS[zone] || 'feliz';
      send(ws, { type: 'emotion', emotion });
      logEvent(deviceId, 'touch', { zone, emotion });
      return;
    }

    default:
      send(ws, { type: 'error', message: `Tipo de mensaje desconocido: ${msg.type}` });
  }
}

function handleBinary(device, data) {
  if (!device.listening) return;
  const maxBytes = config.voice.inputSampleRate * 2 * config.voice.maxListenSeconds;
  if (device.audioBytes + data.length > maxBytes) return; // se corta en el máximo permitido
  device.audio.push(Buffer.from(data));
  device.audioBytes += data.length;
}

/** Engancha el WebSocket del robot al servidor HTTP en /ws/robot?deviceId=...&token=... */
export function attachRobotSocket(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/ws/robot') {
      socket.destroy();
      return;
    }
    const token = url.searchParams.get('token') || req.headers['x-device-token'];
    const deviceId = (url.searchParams.get('deviceId') || 'robot-1').slice(0, 64);
    if (token !== config.deviceToken) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, deviceId));
  });

  function onConnection(ws, deviceId) {
    const previous = devices.get(deviceId);
    if (previous) previous.ws.close(4000, 'Reemplazado por una conexión nueva');

    const device = { ws, connectedAt: new Date().toISOString(), lastSeen: new Date().toISOString(), busy: false, audio: [], audioBytes: 0, listening: false };
    devices.set(deviceId, device);
    logEvent(deviceId, 'connected');
    send(ws, { type: 'welcome', deviceId, voice: voiceEnabled(), inputSampleRate: config.voice.inputSampleRate });
    getPersonality()
      .then((p) => send(ws, { type: 'appearance', ...appearanceOf(p) }))
      .catch((err) => console.error('[robot] no se pudo mandar la apariencia:', err.message));

    ws.on('message', async (data, isBinary) => {
      device.lastSeen = new Date().toISOString();
      if (isBinary) {
        handleBinary(device, data);
        return;
      }
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        send(ws, { type: 'error', message: 'JSON inválido' });
        return;
      }
      try {
        await handleJson(deviceId, device, msg);
      } catch (err) {
        console.error(`[robot ${deviceId}]`, err);
        logEvent(deviceId, 'error', { message: err.message });
        send(ws, { type: 'error', message: err.message });
        send(ws, { type: 'emotion', emotion: 'triste' });
      }
    });

    ws.on('close', () => {
      if (devices.get(deviceId)?.ws === ws) {
        devices.delete(deviceId);
        logEvent(deviceId, 'disconnected');
      }
    });
  }

  // Detecta conexiones muertas (el robot se quedó sin WiFi, se apagó, etc.)
  const interval = setInterval(() => {
    for (const client of wss.clients) {
      if (client.isAlive === false) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }, 30000);
  wss.on('connection', (ws, deviceId) => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    onConnection(ws, deviceId);
  });
  wss.on('close', () => clearInterval(interval));

  return wss;
}
