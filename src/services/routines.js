// Las "rutinas": cosas que el robot dice o hace por su cuenta.
import { getPersonality } from '../models/Personality.js';
import { getSettings } from '../models/Settings.js';
import { formatTime, localParts, startOfLocalDay, DAY } from '../time.js';
import { generate } from './ai.js';
import { announce } from './announce.js';
import { upcomingEvents } from './calendar.js';
import { describeWeather, getWeather } from './weather.js';

function momentOfDay(hour) {
  if (hour < 6) return 'la madrugada';
  if (hour < 13) return 'la mañana';
  if (hour < 20) return 'la tarde';
  return 'la noche';
}

/** Texto de contexto (hora, clima y agenda de hoy) para el saludo. Separado para poder testearlo. */
export function briefingInstruction({ owner, hour, timeText, weatherText, cityName, events, tz }) {
  const parts = [`Son las ${timeText}, es ${momentOfDay(hour)}. Saludá a ${owner} según el momento del día.`];
  if (weatherText) parts.push(`En ${cityName} está ${weatherText}: contáselo con tu estilo.`);
  if (events.length) {
    const list = events
      .slice(0, 5)
      .map((e) => `${formatTime(e.start, tz)} ${e.summary}`)
      .join('; ');
    parts.push(`Hoy le queda en el calendario: ${list}. Mencioná lo más importante, sin leer la lista entera.`);
  }
  parts.push('Dos o tres oraciones como mucho.');
  return parts.join(' ');
}

/** Saludo con hora, clima y agenda. Devuelve también el clima para que la cara lo muestre. */
export async function runBriefing(now = Date.now()) {
  const s = await getSettings();
  const p = localParts(now, s.timezone);
  let weather = null;
  try {
    weather = await getWeather(s.city, s.timezone);
  } catch (err) {
    console.error('[rutinas] clima:', err.message);
  }
  let events = [];
  try {
    events = await upcomingEvents(s, now, startOfLocalDay(now, s.timezone) + DAY);
  } catch (err) {
    console.error('[rutinas] calendario:', err.message);
  }
  const instruction = briefingInstruction({
    owner: s.ownerName,
    hour: p.hour,
    timeText: formatTime(now, s.timezone),
    weatherText: describeWeather(weather),
    cityName: s.city.name,
    events,
    tz: s.timezone,
  });
  const reply = await generate(instruction);
  return announce({
    gesture: 'saludar',
    kind: 'saludo',
    text: reply.text,
    emotion: reply.emotion,
    actions: weather ? ['clima'] : [],
    weather: weather?.category,
  });
}

export async function remindMeeting(ev, minutesLeft) {
  const s = await getSettings();
  const reply = await generate(
    `Avisale a ${s.ownerName} que en ${minutesLeft} minutos (a las ${formatTime(ev.start, s.timezone)}) tiene "${ev.summary}". Una o dos oraciones.`
  );
  return announce({ kind: 'reunion', gesture: 'senalar', text: reply.text, emotion: reply.emotion === 'neutral' ? 'sorprendido' : reply.emotion });
}

export async function remindWater() {
  const s = await getSettings();
  const reply = await generate(`Recordale a ${s.ownerName} que tome un poco de agua. Una oración, con tu estilo.`);
  return announce({ kind: 'agua', text: reply.text, emotion: reply.emotion });
}

export async function finishFocus(focus) {
  const s = await getSettings();
  const reply = await generate(
    `Terminó el bloque de foco de ${focus.minutes} minutos de ${s.ownerName}. Felicitalo y decile que se tome un descanso de cinco minutos. Una o dos oraciones.`
  );
  return announce({ kind: 'foco', text: reply.text, emotion: 'feliz', gesture: 'aplaudir' });
}

/** Susto: apagón y risa macabra. Solo tiene sentido con la cara en estilo terror. */
export async function scare({ force = false } = {}) {
  const p = await getPersonality();
  if (p.faceStyle !== 'terror' && !force) return null;
  return announce({ kind: 'susto', actions: ['apagon', 'risa'] });
}

/** Reacción a un deploy (lo avisa el script de deploy o cualquier workflow con el token del panel). */
export async function deployReaction({ status, repo, env, force = false }) {
  const s = await getSettings();
  if (!s.deployReactions && !force) return null;
  const ok = status === 'success';
  const where = [repo, env === 'dev' ? 'en el entorno de pruebas' : env === 'prod' ? 'en producción' : ''].filter(Boolean).join(' ');
  const reply = await generate(
    ok
      ? `El deploy ${where} salió bien. Festejalo en una oración.`
      : `El deploy ${where} falló. Lamentate de forma dramática en una oración y sugerí mirar los logs.`
  );
  return announce({
    kind: 'deploy',
    text: reply.text,
    emotion: ok ? 'feliz' : 'triste',
    actions: ok ? [] : ['lagrima'],
  });
}
