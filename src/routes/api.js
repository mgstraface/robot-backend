import crypto from 'node:crypto';
import express, { Router } from 'express';
import { config } from '../config.js';
import { EMOTIONS, GESTURES, isEmotion, ROBOT_ACTIONS } from '../emotions.js';
import { Message } from '../models/Message.js';
import { isJpeg, MAX_PHOTO_BYTES, MAX_PHOTOS, Photo } from '../models/Photo.js';
import { appearanceOf, FACE_STYLES, getPersonality, updatePersonality } from '../models/Personality.js';
import { getSettings, publicSettings, sanitizeSettings, SERVO_NAMES, updateSettings } from '../models/Settings.js';
import { callModel, chat } from '../services/ai.js';
import { announce, feedAfter } from '../services/announce.js';
import { pick } from '../services/phrases.js';
import { cocinaAccion, FORMATO_EJEMPLO, getCocina, parseRecipe, PROMPT_PARA_IA, Recipe, startCocina, stopCocina } from '../services/cocina.js';
import { addReminder, cancelReminders, pendingReminders } from '../services/reminders.js';
import { getMood, moodEvent } from '../services/mood.js';
import { listMemories, Memory, remember } from '../services/memory.js';
import { isHalloween } from '../services/extras.js';
import { fraseLeprosa } from '../services/futbol.js';
import { clearCalendarCache, upcomingEvents } from '../services/calendar.js';
import { getFocus, startFocus, stopFocus } from '../services/focus.js';
import { deployReaction, finishFocus, remindMeeting, remindWater, runBriefing, scare } from '../services/routines.js';
import { resetScarePlan } from '../services/scheduler.js';
import { geocode, getWeather } from '../services/weather.js';
import { DAY } from '../time.js';
import { pcmToWav, synthesizeAudio, ttsEnabled } from '../services/voice.js';
import { VOCES } from '../services/edgeTts.js';
import { broadcast, listDevices, recentEvents, setEmotion, speak } from '../ws/robotSocket.js';
import { cocinaParaRobot } from '../ws/robotMenu.js';

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

// Fotos del portarretrato: las pueden leer el panel (token de admin) y el robot (token del robot)
function requireAdminOrDevice(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token && (safeEqual(token, config.adminToken) || safeEqual(token, config.deviceToken))) return next();
  return res.status(401).json({ error: 'No autorizado' });
}

router.get(
  '/photos',
  requireAdminOrDevice,
  asyncRoute(async (req, res) => {
    const photos = await Photo.find({}, { data: 0 }).sort({ createdAt: 1 }).lean();
    res.json(photos.map((p) => ({ id: String(p._id), size: p.size, createdAt: p.createdAt })));
  })
);

router.get(
  '/photos/:id',
  requireAdminOrDevice,
  asyncRoute(async (req, res) => {
    if (!/^[0-9a-f]{24}$/i.test(req.params.id)) return res.status(404).json({ error: 'No encontrada' });
    const p = await Photo.findById(req.params.id).lean();
    if (!p) return res.status(404).json({ error: 'No encontrada' });
    res.set('Cache-Control', 'private, max-age=86400');
    // con .lean() Mongo devuelve un Binary (no un Buffer): se convierte con cuidado
    const data = Buffer.isBuffer(p.data) ? p.data : Buffer.from(p.data.buffer ?? p.data);
    res.type(p.mime || 'image/jpeg').send(data);
  })
);

router.use(requireAdmin);

router.post(
  '/photos',
  express.raw({ type: 'image/jpeg', limit: MAX_PHOTO_BYTES }),
  asyncRoute(async (req, res) => {
    if (!isJpeg(req.body)) return res.status(400).json({ error: 'Mandá la foto como JPEG' });
    if ((await Photo.countDocuments()) >= MAX_PHOTOS) {
      return res.status(400).json({ error: `Máximo ${MAX_PHOTOS} fotos: borrá alguna primero` });
    }
    const p = await Photo.create({ data: req.body, mime: 'image/jpeg', size: req.body.length });
    broadcast({ type: 'photos', changed: true }); // el robot vuelve a sincronizar su tarjeta SD
    res.json({ id: String(p._id), size: p.size, createdAt: p.createdAt });
  })
);

router.delete(
  '/photos/:id',
  asyncRoute(async (req, res) => {
    if (!/^[0-9a-f]{24}$/i.test(req.params.id)) return res.status(404).json({ error: 'No encontrada' });
    await Photo.deleteOne({ _id: req.params.id });
    broadcast({ type: 'photos', changed: true });
    res.json({ ok: true });
  })
);

router.get('/config', async (req, res) => {
  res.json({ model: config.ai.model, voice: ttsEnabled(), voces: VOCES, halloween: isHalloween(Date.now(), (await getSettings()).timezone), emotions: EMOTIONS, gestures: GESTURES, env: config.appEnv });
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
    const { name, systemPrompt, eyeColor, faceStyle } = req.body || {};
    if (eyeColor !== undefined && !/^#[0-9a-fA-F]{6}$/.test(String(eyeColor))) {
      return res.status(400).json({ error: 'Color inválido (usá formato #rrggbb)' });
    }
    if (faceStyle !== undefined && !FACE_STYLES.includes(faceStyle)) {
      return res.status(400).json({ error: `Estilo inválido (${FACE_STYLES.join(', ')})` });
    }
    const updated = await updatePersonality({ name, systemPrompt, eyeColor, faceStyle });
    // Los robots conectados cambian de cara al instante
    if (eyeColor !== undefined || faceStyle !== undefined) broadcast({ type: 'appearance', ...appearanceOf(updated) });
    res.json(updated);
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
    if (!ttsEnabled()) return res.status(503).json({ error: 'Voz del servidor desactivada' });
    const audio = await synthesizeAudio(text);
    if (audio.format === 'mp3') return res.type('audio/mpeg').send(audio.data);
    res.type('audio/wav').send(pcmToWav(audio.data, audio.sampleRate));
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
    if (speakOn) sentTo = await speak(String(speakOn), reply.text, reply.emotion, reply.gesture);
    res.json({ ...reply, sentTo });
  })
);

// ---------- Rutinas ----------

router.get(
  '/settings',
  asyncRoute(async (req, res) => {
    res.json(publicSettings(await getSettings()));
  })
);

router.put(
  '/settings',
  asyncRoute(async (req, res) => {
    const { update, errors } = sanitizeSettings(req.body);
    if (errors.length) return res.status(400).json({ error: `Valores inválidos: ${errors.join(', ')}` });
    const saved = await updateSettings(update);
    if (update.servos) broadcast({ type: 'calibration', servos: saved.servos });
    if ('calendarUrl' in update) clearCalendarCache();
    resetScarePlan();
    res.json(publicSettings(saved));
  })
);

router.get(
  '/geo',
  asyncRoute(async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    res.json(await geocode(q));
  })
);

router.get(
  '/weather',
  asyncRoute(async (req, res) => {
    const s = await getSettings();
    res.json({ city: s.city.name, ...(await getWeather(s.city, s.timezone)) });
  })
);

router.get(
  '/calendar/upcoming',
  asyncRoute(async (req, res) => {
    const s = await getSettings();
    if (!s.calendarUrl) return res.json({ configured: false, events: [] });
    const now = Date.now();
    const events = await upcomingEvents(s, now, now + DAY);
    res.json({ configured: true, events: events.slice(0, 10) });
  })
);

// Saludo con hora, clima y agenda (también se dispara solo al despertarse)
router.post(
  '/briefing',
  asyncRoute(async (req, res) => {
    res.json(await runBriefing());
  })
);

// Avisos que el panel tiene que mostrar (el robot los recibe por WebSocket)
router.get('/feed', (req, res) => {
  const after = Number(req.query.after);
  res.json(feedAfter(Number.isFinite(after) ? after : -1));
});

// Pomodoro
router.get('/focus', (req, res) => {
  res.json({ focus: getFocus() });
});

router.post('/focus', (req, res) => {
  const minutes = Number(req.body?.minutes ?? 25);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) {
    return res.status(400).json({ error: 'Minutos inválidos (1 a 180)' });
  }
  const focus = startFocus(minutes);
  announce({ kind: 'foco-inicio', emotion: 'pensando' });
  res.json({ focus });
});

router.delete('/focus', (req, res) => {
  stopFocus();
  res.json({ focus: null });
});

// ---------- Cocina
router.get('/recetas/formato', (req, res) => res.json({ ejemplo: FORMATO_EJEMPLO, prompt: PROMPT_PARA_IA }));
router.get('/recetas', asyncRoute(async (req, res) => res.json(await Recipe.find().sort({ updatedAt: -1 }).lean())));
router.post(
  '/recetas',
  asyncRoute(async (req, res) => {
    const { text, nombre, conIA } = req.body || {};
    let source = String(text || '').trim();
    if (!source) return res.status(400).json({ error: 'Pegá la receta' });
    if (conIA) {
      // una sola llamada chiquita: pasa cualquier receta al formato Robi
      source = await callModel({
        system: `Convertís recetas al formato de texto que usa un robot de cocina. Respondé SOLO con la receta en este formato:\n\n${FORMATO_EJEMPLO}\n\nUn paso por línea; tiempos de espera entre corchetes ([10 min]); después de "|" un aviso corto para cuando termine el tiempo. Español rioplatense.`,
        messages: [{ role: 'user', content: source.slice(0, 6000) }],
        maxTokens: 1200,
      });
    }
    const r = parseRecipe(source);
    if (nombre) r.nombre = String(nombre).trim().slice(0, 120);
    if (!r.pasos.length) return res.status(400).json({ error: 'No encontré pasos en la receta' });
    res.json(await Recipe.create(r));
  })
);
router.delete(
  '/recetas/:id',
  asyncRoute(async (req, res) => {
    await Recipe.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  })
);
router.get('/cocina', (req, res) => res.json(getCocina()));
router.post(
  '/cocina/start',
  asyncRoute(async (req, res) => {
    const r = await Recipe.findById(req.body?.recetaId).lean();
    if (!r) return res.status(404).json({ error: 'Receta no encontrada' });
    const c = await startCocina(r);
    broadcast(cocinaParaRobot());
    res.json(c);
  })
);
router.post(
  '/cocina/:accion',
  asyncRoute(async (req, res) => {
    const { accion } = req.params;
    if (accion === 'stop') {
      const c = stopCocina();
      broadcast(cocinaParaRobot());
      return res.json(c);
    }
    if (!['siguiente', 'anterior', 'repetir', 'faltan'].includes(accion)) return res.status(400).json({ error: 'Acción inválida' });
    const c = await cocinaAccion(accion);
    broadcast(cocinaParaRobot());
    res.json(c);
  })
);

// ---------- Temporizadores sueltos (los mismos de "avisame en 10 minutos")
router.get('/timers', asyncRoute(async (req, res) => res.json(await pendingReminders())));
router.post(
  '/timers',
  asyncRoute(async (req, res) => {
    const seg = Math.round(Number(req.body?.segundos));
    if (!Number.isFinite(seg) || seg < 5 || seg > 24 * 3600) return res.status(400).json({ error: 'Tiempo inválido' });
    await addReminder({ at: new Date(Date.now() + seg * 1000), kind: 'timer', text: String(req.body?.texto || '').slice(0, 120) });
    res.json(await pendingReminders());
  })
);
router.delete(
  '/timers',
  asyncRoute(async (req, res) => {
    await cancelReminders();
    res.json([]);
  })
);

// ---------- Calibración y diagnóstico del robot
router.post('/robot/servo', (req, res) => {
  const { servo, angle } = req.body || {};
  const a = Math.round(Number(angle));
  if (!SERVO_NAMES.includes(servo) || !Number.isFinite(a) || a < 0 || a > 180) return res.status(400).json({ error: 'Servo o ángulo inválido' });
  // modo calibración: el robot mueve SOLO ese servo, despacio
  res.json({ sentTo: broadcast({ type: 'servo', servo, angle: a }) });
});
router.post('/robot/servo/stop', (req, res) => res.json({ sentTo: broadcast({ type: 'servo_stop' }) }));
// Token del robot, para copiarlo en firmware/include/secrets.h (solo con la clave de admin)
router.get('/robot/token', (req, res) => res.json({ token: config.deviceToken }));

router.post('/robot/test', (req, res) => {
  const { what } = req.body || {};
  if (!['pantalla', 'audio', 'servos', 'sensores', 'reiniciar'].includes(what)) return res.status(400).json({ error: 'Prueba inválida' });
  res.json({ sentTo: broadcast({ type: 'test', what }) });
});

// ---------- Memoria de largo plazo
router.get('/memories', asyncRoute(async (req, res) => res.json(await listMemories())));
router.post(
  '/memories',
  asyncRoute(async (req, res) => {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Falta el texto' });
    await remember([text]);
    res.json(await listMemories());
  })
);
router.delete(
  '/memories/:id',
  asyncRoute(async (req, res) => {
    await Memory.deleteOne({ _id: req.params.id });
    res.json(await listMemories());
  })
);

// ---------- Ánimo
router.get('/mood', (req, res) => res.json(getMood()));
router.post('/mood/event', (req, res) => {
  const { kind } = req.body || {};
  if (!['mimo', 'juego', 'tocar'].includes(kind)) return res.status(400).json({ error: 'Evento inválido' });
  res.json(moodEvent(kind));
});

// Mover la cabeza del robot (asentir, negar, mirar…)
router.post('/gesture', (req, res) => {
  const { gesture } = req.body || {};
  if (!GESTURES.includes(gesture)) return res.status(400).json({ error: 'Gesto inválido', gestures: GESTURES });
  res.json({ ok: true, sentTo: broadcast({ type: 'gesture', gesture }) });
});

// Probar una acción en el robot y el panel (ej. el susto)
router.post(
  '/action',
  asyncRoute(async (req, res) => {
    const { action, weather } = req.body || {};
    if (action === 'susto') return res.json((await scare()) || { skipped: 'El susto solo funciona con el estilo terror' });
    if (!ROBOT_ACTIONS.includes(action)) return res.status(400).json({ error: 'Acción inválida', actions: ROBOT_ACTIONS });
    res.json(await announce({ kind: 'manual', actions: [action], weather }));
  })
);

// Probar una rutina sin esperar a que ocurra (botón "Probar" del panel)
const TRIES = {
  saludo: () => runBriefing(),
  agua: () => remindWater(),
  reunion: () => remindMeeting({ uid: 'prueba', summary: 'Reunión de prueba', start: Date.now() + 10 * 60 * 1000 }, 10),
  'deploy-ok': () => deployReaction({ status: 'success', repo: 'robot', env: 'prod', force: true }),
  'deploy-falla': () => deployReaction({ status: 'failure', repo: 'robot', env: 'prod', force: true }),
  susto: () => scare({ force: true }),
  'foco-fin': () => finishFocus({ minutes: 25 }),
  'gol-rival': () =>
    announce({ kind: 'futbol', text: pick('futbolGolRival', { us: 1, rival: 1, contra: 'Central' }), emotion: 'enojado', gesture: 'negar' }),
  'derrota': () => announce({ kind: 'futbol', text: pick('futbolFinal_perdimos', { us: 0, rival: 1, contra: 'Central' }), emotion: 'triste', gesture: 'negar' }),
  'victoria': () =>
    announce({ kind: 'futbol', text: pick('futbolFinal_ganamos', { us: 2, rival: 0, contra: 'Central' }), emotion: 'riendo', actions: ['bandera'], gesture: 'festejar' }),
  'central-perdio': () => announce({ kind: 'futbol', text: pick('futbolCentralPerdio', { contra: 'Boca' }), emotion: 'picaro' }),
  frase: async () => announce({ kind: 'futbol', text: fraseLeprosa(await getSettings()), emotion: 'feliz', actions: ['bandera'], gesture: 'bailar' }),
  gol: () => announce({ kind: 'futbol', text: pick('futbolGol', { us: 1, rival: 0, contra: 'Central' }), emotion: 'riendo', actions: ['gol'], gesture: 'festejar' }),
};

router.post(
  '/try/:kind',
  asyncRoute(async (req, res) => {
    const run = TRIES[req.params.kind];
    if (!run) return res.status(400).json({ error: 'Prueba desconocida', kinds: Object.keys(TRIES) });
    res.json(await run());
  })
);

// Eventos externos: el script de deploy (o cualquier workflow) avisa cómo salió un deploy
router.post(
  '/hooks/event',
  asyncRoute(async (req, res) => {
    const { kind, status, repo, env } = req.body || {};
    if (kind !== 'deploy' || !['success', 'failure'].includes(status)) {
      return res.status(400).json({ error: 'Se espera { kind: "deploy", status: "success" | "failure" }' });
    }
    res.json((await deployReaction({ status, repo: repo ? String(repo).slice(0, 60) : '', env })) || { skipped: true });
  })
);

export default router;
