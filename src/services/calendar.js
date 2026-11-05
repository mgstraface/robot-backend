// Calendario del usuario a partir de su dirección secreta iCal (Google Calendar, Outlook, etc.).
import { occurrencesBetween, parseICS } from './ics.js';

const CACHE_MS = 10 * 60 * 1000;
let cache = { url: '', at: 0, events: [] };

async function loadEvents(url, tz) {
  if (cache.url === url && Date.now() - cache.at < CACHE_MS) return cache.events;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { Accept: 'text/calendar' } });
  if (!res.ok) throw new Error(`El calendario respondió ${res.status}`);
  const text = await res.text();
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('La dirección no devuelve un calendario iCal');
  const events = parseICS(text, tz);
  cache = { url, at: Date.now(), events };
  return events;
}

/** Eventos con horario (no de día completo) que empiezan entre `from` y `to`. */
export async function upcomingEvents(settings, from, to) {
  if (!settings.calendarUrl) return [];
  const events = await loadEvents(settings.calendarUrl, settings.timezone);
  return occurrencesBetween(events, from, to, settings.timezone).filter((e) => !e.allDay);
}

export function clearCalendarCache() {
  cache = { url: '', at: 0, events: [] };
}
