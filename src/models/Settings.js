import mongoose from 'mongoose';
import { isValidTimeZone } from '../time.js';

// Ajustes de las rutinas del robot (un solo documento).
export const SERVO_NAMES = ['pan', 'tilt', 'armL', 'armR'];

export const DEFAULT_SETTINGS = {
  ownerName: 'Mati',
  city: { name: 'Rosario', lat: -32.9468, lon: -60.6393 },
  timezone: 'America/Argentina/Buenos_Aires',
  sleepFrom: 0, // de 0 a 7 h duerme
  sleepTo: 7,
  morningGreeting: true, // saludo con hora, clima y agenda al "despertarse"
  scaresPerDay: 0, // modo susto (solo con estilo terror)
  waterEveryMin: 0, // recordatorio de tomar agua (0 = apagado)
  calendarUrl: '', // dirección secreta iCal (.ics)
  meetingNoticeMin: 10, // cuántos minutos antes avisa
  deployReactions: true,
  futbol: true, // hincha de Newell's: avisa partidos, festeja goles
  voz: 'es-AR-TomasNeural', // voz de Edge (ver services/edgeTts.js)
  vozTono: 'normal', // normal | agudo | grave
  // Calibración de cada servo (grados 0–180). Límites conservadores hasta calibrar con el robot armado.
  servos: {
    pan: { centro: 90, min: 30, max: 150, invertido: false, vel: 120 },
    tilt: { centro: 90, min: 65, max: 115, invertido: false, vel: 90 },
    armL: { centro: 20, min: 0, max: 170, invertido: false, vel: 180 },
    armR: { centro: 20, min: 0, max: 170, invertido: true, vel: 180 },
  },
  fechas: [], // [{ nombre, dia, mes, tipo: cumple | aniversario | otro }]
  frasesCadaHoras: 3, // cada cuánto tira una frase leprosa (0 = nunca)
  frasesLeprosas: [], // frases propias (si está vacío usa las de fábrica)
  frameEnabled: false, // portarretrato: intercala la cara con fotos
  frameFaceSec: 60, // cuánto muestra la cara entre foto y foto
  framePhotoSec: 10, // cuánto muestra cada foto
};

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },
    ownerName: { type: String, maxlength: 40 },
    city: {
      name: { type: String, maxlength: 80 },
      lat: { type: Number, min: -90, max: 90 },
      lon: { type: Number, min: -180, max: 180 },
    },
    timezone: { type: String, maxlength: 64 },
    sleepFrom: { type: Number, min: 0, max: 23 },
    sleepTo: { type: Number, min: 0, max: 23 },
    morningGreeting: Boolean,
    scaresPerDay: { type: Number, min: 0, max: 6 },
    waterEveryMin: { type: Number, min: 0, max: 600 },
    calendarUrl: { type: String, maxlength: 2000 },
    meetingNoticeMin: { type: Number, min: 1, max: 120 },
    deployReactions: Boolean,
    futbol: Boolean,
    voz: String,
    vozTono: String,
    servos: { type: Object },
    fechas: [{ _id: false, nombre: String, dia: Number, mes: Number, tipo: String }],
    frasesCadaHoras: Number,
    frasesLeprosas: [{ type: String, maxlength: 300 }],
    frameEnabled: Boolean,
    frameFaceSec: { type: Number, min: 10, max: 3600 },
    framePhotoSec: { type: Number, min: 3, max: 120 },
  },
  { timestamps: true, minimize: false }
);

export const Settings = mongoose.model('Settings', settingsSchema);

export function withDefaults(doc) {
  const s = { ...DEFAULT_SETTINGS, ...(doc || {}) };
  s.city = { ...DEFAULT_SETTINGS.city, ...(doc?.city || {}) };
  for (const k of Object.keys(s)) if (s[k] === null || s[k] === undefined) s[k] = DEFAULT_SETTINGS[k];
  return s;
}

let cache = null;

export async function getSettings() {
  if (cache) return cache;
  const doc = await Settings.findOne({ key: 'default' }).lean();
  cache = withDefaults(doc);
  return cache;
}

const int = (v, min, max) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};

/** Valida y limpia lo que llega del panel. Devuelve { update, errors }. */
export function sanitizeSettings(body = {}) {
  const update = {};
  const errors = [];
  const set = (key, value, ok) => {
    if (body[key] === undefined) return;
    if (value === undefined || ok === false) errors.push(key);
    else update[key] = value;
  };

  set('ownerName', typeof body.ownerName === 'string' ? body.ownerName.trim().slice(0, 40) : undefined, Boolean(String(body.ownerName || '').trim()));
  if (body.city !== undefined) {
    const c = body.city || {};
    const lat = Number(c.lat);
    const lon = Number(c.lon);
    if (typeof c.name === 'string' && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      update.city = { name: c.name.slice(0, 80), lat, lon };
    } else errors.push('city');
  }
  set('timezone', body.timezone, typeof body.timezone === 'string' && isValidTimeZone(body.timezone));
  set('sleepFrom', int(body.sleepFrom, 0, 23));
  set('sleepTo', int(body.sleepTo, 0, 23));
  set('morningGreeting', typeof body.morningGreeting === 'boolean' ? body.morningGreeting : undefined);
  set('scaresPerDay', int(body.scaresPerDay, 0, 6));
  set('waterEveryMin', int(body.waterEveryMin, 0, 600));
  set('meetingNoticeMin', int(body.meetingNoticeMin, 1, 120));
  set('deployReactions', typeof body.deployReactions === 'boolean' ? body.deployReactions : undefined);
  set('futbol', typeof body.futbol === 'boolean' ? body.futbol : undefined);
  set('voz', typeof body.voz === 'string' && /^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/.test(body.voz) ? body.voz : undefined);
  set('vozTono', ['normal', 'agudo', 'grave'].includes(body.vozTono) ? body.vozTono : undefined);
  if (body.servos !== undefined) {
    const out = {};
    let ok = body.servos && typeof body.servos === 'object';
    for (const k of SERVO_NAMES) {
      const v = body.servos?.[k];
      if (!v) continue;
      const n = (x) => Math.round(Number(x));
      const c = { centro: n(v.centro), min: n(v.min), max: n(v.max), invertido: Boolean(v.invertido), vel: n(v.vel) };
      if (![c.centro, c.min, c.max, c.vel].every(Number.isFinite) || c.min < 0 || c.max > 180 || c.min > c.centro || c.centro > c.max || c.vel < 10 || c.vel > 360) ok = false;
      else out[k] = c;
    }
    if (ok) update.servos = { ...DEFAULT_SETTINGS.servos, ...out };
    else errors.push('servos');
  }
  if (body.fechas !== undefined) {
    if (!Array.isArray(body.fechas)) errors.push('fechas');
    else {
      update.fechas = body.fechas
        .map((f) => ({
          nombre: String(f?.nombre || '').trim().slice(0, 60),
          dia: Number(f?.dia),
          mes: Number(f?.mes),
          tipo: ['cumple', 'aniversario', 'otro'].includes(f?.tipo) ? f.tipo : 'cumple',
        }))
        .filter((f) => f.nombre && Number.isInteger(f.dia) && Number.isInteger(f.mes) && f.mes >= 1 && f.mes <= 12 && f.dia >= 1 && f.dia <= 31)
        .slice(0, 40);
    }
  }
  set('frasesCadaHoras', int(body.frasesCadaHoras, 0, 24));
  if (body.frasesLeprosas !== undefined) {
    if (Array.isArray(body.frasesLeprosas)) {
      update.frasesLeprosas = body.frasesLeprosas
        .map((f) => String(f || '').trim().slice(0, 300))
        .filter(Boolean)
        .slice(0, 50);
    } else errors.push('frasesLeprosas');
  }
  set('frameEnabled', typeof body.frameEnabled === 'boolean' ? body.frameEnabled : undefined);
  set('frameFaceSec', int(body.frameFaceSec, 10, 3600));
  set('framePhotoSec', int(body.framePhotoSec, 3, 120));
  if (body.calendarUrl !== undefined) {
    const url = String(body.calendarUrl || '').trim().replace(/^webcal:\/\//i, 'https://');
    if (url === '' || /^https:\/\/\S+$/i.test(url)) update.calendarUrl = url;
    else errors.push('calendarUrl');
  }
  return { update, errors };
}

export async function updateSettings(update) {
  const doc = await Settings.findOneAndUpdate(
    { key: 'default' },
    { $set: update, $setOnInsert: { key: 'default' } },
    { new: true, upsert: true, lean: true, runValidators: true }
  );
  cache = withDefaults(doc);
  return cache;
}

/** Versión para el panel: la URL del calendario es secreta, se muestra enmascarada. */
export function publicSettings(s) {
  const { calendarUrl, ...rest } = s;
  let calendarPreview = '';
  if (calendarUrl) {
    try {
      calendarPreview = `${new URL(calendarUrl).host}/…${calendarUrl.slice(-6)}`;
    } catch {
      calendarPreview = 'configurado';
    }
  }
  return { ...rest, hasCalendar: Boolean(calendarUrl), calendarPreview };
}
