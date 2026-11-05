// Dispara los timers y alarmas a tiempo (con setTimeout) y los recarga si el servidor se reinicia.
import { Reminder } from '../models/Reminder.js';
import { announce } from './announce.js';
import { pick } from './phrases.js';

const timers = new Map();
const MAX_DELAY = 2 ** 31 - 1; // límite de setTimeout (~24 días)

function arm(r) {
  clearTimeout(timers.get(String(r._id)));
  const delay = Math.max(0, new Date(r.at).getTime() - Date.now());
  if (delay > MAX_DELAY) return; // se arma en el próximo reinicio o recarga diaria
  timers.set(String(r._id), setTimeout(() => fire(r._id).catch((e) => console.error('Recordatorio:', e.message)), delay));
}

async function fire(id) {
  timers.delete(String(id));
  const r = await Reminder.findOneAndUpdate({ _id: id, done: false }, { done: true }, { new: true });
  if (!r) return;
  const text = r.text ? pick('recordatorio', { que: r.text }) : pick(r.kind === 'alarma' ? 'alarma' : 'timer');
  await announce({ kind: r.kind, text, emotion: 'sorprendido', actions: [], gesture: 'senalar' });
}

export async function addReminder({ at, kind, text }) {
  const r = await Reminder.create({ at, kind, text });
  arm(r);
  return r;
}

export async function pendingReminders() {
  return Reminder.find({ done: false }).sort({ at: 1 }).lean();
}

/** Cancela los pendientes. Con kind ('timer') cancela solo esos (las alarmas quedan). */
export async function cancelReminders(kind) {
  const filter = { done: false, ...(kind ? { kind } : {}) };
  const list = await Reminder.find(filter).lean();
  for (const r of list) {
    clearTimeout(timers.get(String(r._id)));
    timers.delete(String(r._id));
  }
  await Reminder.updateMany(filter, { done: true });
  return list.length;
}

export async function loadReminders() {
  for (const r of await pendingReminders()) arm(r);
}
