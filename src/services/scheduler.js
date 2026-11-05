// Reloj de las rutinas: una vez por minuto decide si hay que saludar, avisar una reunión,
// recordar el agua, cerrar el bloque de foco o pegar un susto.
import { fedeTick } from './fede.js';
import { frasesTick, futbolTick } from './futbol.js';
import { fechasAvisos, isHalloween } from './extras.js';
import { moodTick } from './mood.js';
import { announce } from './announce.js';
import { pick } from './phrases.js';
import { getSettings } from '../models/Settings.js';
import { DAY, isSleepHour, localParts, startOfLocalDay } from '../time.js';
import { upcomingEvents } from './calendar.js';
import { getFocus, takeFinishedFocus } from './focus.js';
import { finishFocus, remindMeeting, remindWater, runBriefing, scare } from './routines.js';

const TICK_MS = 60 * 1000;

const state = {
  greetedDay: null, // día local (YYYY-M-D) en que ya saludó
  announcedMeetings: new Set(),
  lastWaterAt: Date.now(),
  scaresDay: null,
  scareTimes: [],
};

/** Reparte `n` sustos al azar entre las horas despierto de un día (instantes UTC). */
export function planScares(n, dayStart, sleepFrom, sleepTo, rand = Math.random) {
  const awake = [];
  for (let h = 0; h < 24; h++) if (!isSleepHour(h, sleepFrom, sleepTo)) awake.push(h);
  if (!n || !awake.length) return [];
  const times = [];
  for (let i = 0; i < n; i++) {
    const hour = awake[Math.floor(rand() * awake.length)];
    times.push(dayStart + hour * 3600 * 1000 + Math.floor(rand() * 60) * 60 * 1000);
  }
  return times.sort((a, b) => a - b);
}

/** ¿Hay que avisar este evento ahora? (entra en la ventana de aviso y todavía no empezó) */
export function shouldRemind(now, eventStart, noticeMin) {
  const left = eventStart - now;
  return left > 0 && left <= noticeMin * 60 * 1000;
}

async function safely(label, fn) {
  try {
    await fn();
  } catch (err) {
    console.error(`[rutinas] ${label}:`, err.message);
  }
}

export async function tick(now = Date.now()) {
  const s = await getSettings();
  const p = localParts(now, s.timezone);
  const dayKey = `${p.year}-${p.month}-${p.day}`;
  const sleeping = isSleepHour(p.hour, s.sleepFrom, s.sleepTo);

  // Bloque de foco terminado
  const finished = takeFinishedFocus(now);
  if (finished) await safely('foco', () => finishFocus(finished));

  // Ánimo: evoluciona cada minuto; si hace mucho que nadie le da bola, lo reclama
  if (moodTick({ sleeping, now }) && !getFocus(now)) {
    await safely('reclamo', () => announce({ kind: 'animo', text: pick('reclamo'), emotion: 'aburrido', gesture: 'saludar' }));
  }

  // Newell's: corre aunque esté en horario de dormir (un gol a la noche lo despierta)
  if (s.futbol) await safely('futbol', () => futbolTick({ now, tz: s.timezone, sleeping }));
  if (s.futbol) await safely('frases', () => frasesTick({ now, s, sleeping }));

  if (sleeping) return;

  // Chiste interno: cada tanto llama a Fede
  if (!getFocus(now)) await safely('fede', () => fedeTick(now));

  // Saludo del día, la primera vez que está despierto
  if (s.morningGreeting && state.greetedDay !== dayKey) {
    state.greetedDay = dayKey;
    await safely('saludo', () => runBriefing(now));
  }

  // Cumpleaños y fechas: una vez por día, al rato de despertarse
  if (state.fechasDay !== dayKey && p.hour >= Math.max(9, s.sleepTo)) {
    state.fechasDay = dayKey;
    for (const a of fechasAvisos(s.fechas || [], now, s.timezone)) {
      await safely('fechas', () =>
        announce({ kind: 'fecha', text: a.texto, emotion: a.dias === 0 ? 'emocionado' : 'curioso', gesture: a.dias === 0 ? 'festejar' : 'senalar' })
      );
    }
  }

  // Reuniones
  if (s.calendarUrl) {
    await safely('reuniones', async () => {
      const events = await upcomingEvents(s, now, now + (s.meetingNoticeMin + 1) * 60 * 1000);
      for (const ev of events) {
        const key = `${ev.uid}@${ev.start}`;
        if (state.announcedMeetings.has(key) || !shouldRemind(now, ev.start, s.meetingNoticeMin)) continue;
        state.announcedMeetings.add(key);
        await remindMeeting(ev, Math.max(1, Math.round((ev.start - now) / 60000)));
      }
      if (state.announcedMeetings.size > 500) state.announcedMeetings.clear();
    });
  }

  // Agua (no interrumpe un bloque de foco)
  if (s.waterEveryMin > 0 && !getFocus(now) && now - state.lastWaterAt >= s.waterEveryMin * 60 * 1000) {
    state.lastWaterAt = now;
    await safely('agua', remindWater);
  }

  // Sustos del día
  if (state.scaresDay !== dayKey) {
    state.scaresDay = dayKey;
    // En Halloween, sustos seguidos aunque no estén activados
    const n = isHalloween(now, s.timezone) ? Math.max(s.scaresPerDay, 6) : s.scaresPerDay;
    state.scareTimes = planScares(n, startOfLocalDay(now, s.timezone), s.sleepFrom, s.sleepTo).filter((t) => t > now);
  }
  if (state.scareTimes.length && state.scareTimes[0] <= now) {
    state.scareTimes.shift();
    if (!getFocus(now)) await safely('susto', () => scare({ force: isHalloween(now, s.timezone) }));
  }
}

/** Al cambiar los ajustes, se replanifican los sustos del día. */
export function resetScarePlan() {
  state.scaresDay = null;
}

export function startScheduler() {
  // Que el primer saludo no salte apenas se reinicia el servidor en medio del día:
  // si ya es de día al arrancar, se da por saludado hoy.
  getSettings()
    .then((s) => {
      const p = localParts(Date.now(), s.timezone);
      if (!isSleepHour(p.hour, s.sleepFrom, s.sleepTo)) state.greetedDay = `${p.year}-${p.month}-${p.day}`;
    })
    .catch(() => {});
  const id = setInterval(() => {
    tick().catch((err) => console.error('[rutinas]', err));
  }, TICK_MS);
  id.unref?.();
  return id;
}

export { DAY };
