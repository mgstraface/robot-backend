// Estado de ánimo de Robi: energía, humor y ganas de atención (0 a 100).
// Cambian solos con el tiempo y con lo que pasa (mimos, charlas, goles, que lo ignoren).
// La lógica es pura (step / applyEvent) para testearla; el estado vive en memoria y se guarda en Mongo.
import mongoose from 'mongoose';

const moodSchema = new mongoose.Schema(
  { key: { type: String, default: 'default', unique: true }, energia: Number, humor: Number, atencion: Number, lastInteraction: Date },
  { timestamps: true }
);
const Mood = mongoose.models?.Mood || mongoose.model('Mood', moodSchema);

const clamp = (v) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));

// Cuánto suma/resta cada cosa que pasa
export const EVENTS = {
  mimo: { humor: 8, atencion: -30 },
  charla: { humor: 3, atencion: -25 },
  tocar: { humor: 4, atencion: -20 },
  juego: { humor: 10, atencion: -35, energia: -4 },
  gol: { humor: 15 },
  victoria: { humor: 20 },
  derrota: { humor: -15 },
  sacudir: { humor: -8, energia: 3 },
  ignorado: { humor: -4 },
};

/** Un minuto de vida: la atención sube sola, la energía baja de día y se recarga dormido, el humor vuelve a 50. */
export function step(m, { sleeping = false, minutes = 1 } = {}) {
  const k = minutes;
  return {
    ...m,
    atencion: clamp(m.atencion + (sleeping ? 0 : 0.35 * k)),
    energia: clamp(m.energia + (sleeping ? 0.8 * k : -0.07 * k)),
    humor: clamp(m.humor + (50 - m.humor) * 0.004 * k),
  };
}

export function applyEvent(m, kind, now = Date.now()) {
  const d = EVENTS[kind];
  if (!d) return m;
  return {
    ...m,
    energia: clamp(m.energia + (d.energia || 0)),
    humor: clamp(m.humor + (d.humor || 0)),
    atencion: clamp(m.atencion + (d.atencion || 0)),
    lastInteraction: kind === 'ignorado' || kind === 'gol' || kind === 'victoria' || kind === 'derrota' ? m.lastInteraction : now,
  };
}

/** Palabras para la IA y el panel. */
export function describeMood(m) {
  const e = m.energia < 25 ? 'muy cansado' : m.energia < 50 ? 'algo cansado' : m.energia > 80 ? 'con mucha energía' : 'bien de energía';
  const h = m.humor < 25 ? 'de muy mal humor' : m.humor < 45 ? 'medio bajoneado' : m.humor > 75 ? 'muy contento' : 'de buen humor';
  const a = m.atencion > 80 ? 'y con muchas ganas de que te den bola' : m.atencion > 55 ? 'y con ganas de charlar' : '';
  return `${e}, ${h} ${a}`.trim();
}

let state = { energia: 80, humor: 60, atencion: 30, lastInteraction: Date.now() };
let loaded = false;
let lastSave = 0;

export async function loadMood() {
  try {
    const doc = await Mood.findOne({ key: 'default' }).lean();
    if (doc) state = { energia: doc.energia, humor: doc.humor, atencion: doc.atencion, lastInteraction: new Date(doc.lastInteraction || Date.now()).getTime() };
  } catch {
    /* arranca con los valores por defecto */
  }
  loaded = true;
}

async function save(force = false) {
  if (!loaded || (!force && Date.now() - lastSave < 5 * 60_000)) return;
  lastSave = Date.now();
  await Mood.updateOne({ key: 'default' }, { $set: { ...state, lastInteraction: new Date(state.lastInteraction) } }, { upsert: true }).catch(() => {});
}

export function getMood() {
  return { ...state, descripcion: describeMood(state) };
}

/** Registra algo que pasó (mimo, charla, gol…). */
export function moodEvent(kind) {
  state = applyEvent(state, kind);
  save();
  return getMood();
}

/** Lo llama el scheduler cada minuto. Devuelve true si Robi debería reclamar atención ahora. */
export function moodTick({ sleeping = false, now = Date.now() } = {}) {
  state = step(state, { sleeping });
  save();
  if (sleeping) return false;
  // reclama si tiene muchas ganas de atención y hace rato que nadie le habla (máximo una vez cada 45 min)
  if (state.atencion > 85 && now - state.lastInteraction > 40 * 60_000 && now - (state.lastClaim || 0) > 45 * 60_000) {
    state = { ...applyEvent(state, 'ignorado', now), lastClaim: now };
    return true;
  }
  return false;
}
