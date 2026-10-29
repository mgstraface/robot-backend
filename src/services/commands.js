// Filtro de comandos: lo que se puede resolver sin IA (hora, clima, timers, alarmas, chistes, foco)
// se responde acá, gratis y al instante. Si no es un comando, devuelve null y sigue la IA.
import { getSettings } from '../models/Settings.js';
import { formatTime, localParts, zonedToUtc, DAY } from '../time.js';
import { startFocus } from './focus.js';
import { matchAnswer } from './futbol.js';
import { pick } from './phrases.js';
import { addReminder, cancelReminders, pendingReminders } from './reminders.js';
import { describeWeather, getWeather } from './weather.js';

const NUMBERS = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, quince: 15, veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40, cuarentaicinco: 45, media: 0.5,
};
const UNIT_MS = { segundo: 1000, minuto: 60_000, hora: 3_600_000 };
const NUM = `(\\d+|${Object.keys(NUMBERS).join('|')})`;

export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!,;"]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(ey |hola |che |oye )?(robi|robot|huesito|vendita)?\s*/, '')
    .trim();
}

function toNumber(w) {
  return /^\d+$/.test(w) ? Number(w) : NUMBERS[w];
}

function durationMs(t) {
  if (/\bmedia hora\b/.test(t)) return 30 * 60_000;
  const m = t.match(new RegExp(`\\b${NUM} (segundo|minuto|hora)s?\\b( y media)?`));
  if (!m) return null;
  let ms = toNumber(m[1]) * UNIT_MS[m[2]];
  if (m[3]) ms += UNIT_MS[m[2]] / 2;
  return ms;
}

function whatToRemind(t) {
  const m = t.match(/\bque (.+?)(?= en (\d|un|una|media)\b|$)/) || t.match(/\ben .+? (?:segundos?|minutos?|horas?) que (.+)$/);
  return m ? m[1].trim() : '';
}

/** Interpreta el texto y devuelve el comando (o null). Pura: no toca nada, para poder testearla. */
export function parseCommand(text) {
  const t = normalize(text);
  if (!t || t.length > 120) return null;

  if (/\b(cancela|cancelar|borra|borrar|saca|sacar)\b.*\b(timers?|alarmas?|recordatorios?|temporizador)\b/.test(t)) return { type: 'cancelar' };
  if (/\b(que|cuantos|cuantas) (timers|alarmas|recordatorios)\b|\btengo (algun|alguna|algo) (timer|alarma|recordatorio|pendiente)/.test(t))
    return { type: 'pendientes' };

  const alarm = t.match(/\b(despertame|alarma|avisame|recordame)\b.*?\ba las (\d{1,2})(?:[:. ](\d{2})| y (media|cuarto))?(?: (?:de la|a la) (manana|tarde|noche))?/);
  if (alarm) {
    let hour = Number(alarm[2]);
    const minute = alarm[3] ? Number(alarm[3]) : alarm[4] === 'media' ? 30 : alarm[4] === 'cuarto' ? 15 : 0;
    if ((alarm[5] === 'tarde' || alarm[5] === 'noche') && hour < 12) hour += 12;
    if (hour > 23 || minute > 59) return null;
    return { type: 'alarma', hour, minute, que: alarm[1] === 'despertame' || alarm[1] === 'alarma' ? '' : whatToRemind(t) };
  }

  if (/\b(avisame|recordame|timer|temporizador|cronometro)\b/.test(t)) {
    const ms = durationMs(t);
    if (ms) return { type: 'timer', ms, que: whatToRemind(t) };
  }

  if (/(^|\b(me decis|decime|sabes) )que hora es$|^hora$/.test(t)) return { type: 'hora' };
  if (/(^|\b(me decis|decime|sabes) )que (dia|fecha) es( hoy)?$/.test(t)) return { type: 'fecha' };
  if (t.length < 60 && /\b(clima|temperatura|llueve|llover|lluvia|hace frio|hace calor|como esta el dia)\b/.test(t)) return { type: 'clima' };
  if (/\b(conta|contame|deci|decime|tira|tirame)( un| otro)? chiste\b/.test(t)) return { type: 'chiste' };
  if (/\b(newell|newells|nob|la lepra|lepra)\b/.test(t)) {
    if (/\b(como (salio|le fue|quedo|va|esta)|resultado|cuanto (salio|va|esta)|gano|perdio|empato)\b/.test(t)) return { type: 'futbol', kind: 'resultado' };
    if (/\b(cuando|a que hora|contra quien|proximo partido|juega)\b/.test(t)) return { type: 'futbol', kind: 'cuando' };
  }
  if (/\b(modo foco|arranca(r)? (el )?foco|pomodoro)\b/.test(t)) return { type: 'foco' };
  return null;
}

function humanDuration(ms) {
  const min = Math.round(ms / 60_000);
  if (ms < 60_000) return `${Math.round(ms / 1000)} segundos`;
  if (min < 60) return min === 1 ? '1 minuto' : `${min} minutos`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return `${h === 1 ? '1 hora' : `${h} horas`}${rest ? ` y ${rest} minutos` : ''}`;
}

/** Próximo instante (hoy o mañana) con esa hora local. */
export function nextAt(hour, minute, tz, now = Date.now()) {
  const p = localParts(now, tz);
  let at = zonedToUtc(p.year, p.month, p.day, hour, minute, 0, tz);
  if (at <= now) at += DAY;
  return at;
}

/** Ejecuta el comando si lo hay. Devuelve { text, emotion, gesture } o null. */
export async function runCommand(text, now = Date.now()) {
  const cmd = parseCommand(text);
  if (!cmd) return null;
  const s = await getSettings();
  const tz = s.timezone;
  switch (cmd.type) {
    case 'hora':
      return { text: pick('hora', { hora: formatTime(now, tz) }), emotion: 'feliz' };
    case 'fecha':
      return {
        text: pick('fecha', { fecha: new Date(now).toLocaleDateString('es-AR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }) }),
        emotion: 'feliz',
      };
    case 'clima':
      try {
        const w = await getWeather(s.city, tz);
        return { text: pick('clima', { clima: describeWeather(w) }), emotion: w.category === 'despejado' ? 'feliz' : 'neutral', weather: w.category };
      } catch {
        return { text: pick('climaError'), emotion: 'triste' };
      }
    case 'timer': {
      await addReminder({ at: new Date(now + cmd.ms), kind: cmd.que ? 'recordatorio' : 'timer', text: cmd.que });
      const cuanto = humanDuration(cmd.ms);
      return { text: cmd.que ? pick('recordatorioOk', { cuanto, que: cmd.que }) : pick('timerOk', { cuanto }), emotion: 'feliz', gesture: 'asentir' };
    }
    case 'alarma': {
      const at = nextAt(cmd.hour, cmd.minute, tz, now);
      await addReminder({ at: new Date(at), kind: cmd.que ? 'recordatorio' : 'alarma', text: cmd.que });
      return { text: pick('alarmaOk', { hora: formatTime(at, tz) }), emotion: 'feliz', gesture: 'asentir' };
    }
    case 'cancelar': {
      const n = await cancelReminders();
      return n
        ? { text: pick('cancelados', { n: n === 1 ? 'uno' : `${n}` }), emotion: 'neutral', gesture: 'asentir' }
        : { text: pick('nadaPendiente'), emotion: 'neutral', gesture: 'negar' };
    }
    case 'pendientes': {
      const list = await pendingReminders();
      if (!list.length) return { text: pick('nadaPendiente'), emotion: 'neutral', gesture: 'negar' };
      const items = list.slice(0, 5).map((r) => `${r.text || r.kind} a las ${formatTime(r.at, tz)}`);
      return { text: pick('pendientes', { lista: items.join(', ') }), emotion: 'curioso' };
    }
    case 'futbol':
      try {
        return await matchAnswer(cmd.kind, tz, now);
      } catch {
        return { text: 'No pude ver los partidos ahora. Probá en un rato.', emotion: 'triste' };
      }
    case 'chiste':
      return { text: pick('chiste'), emotion: 'feliz' };
    case 'foco':
      startFocus(25);
      return { text: pick('foco'), emotion: 'pensando', gesture: 'asentir' };
    default:
      return null;
  }
}
