// Parser mínimo de calendarios iCal (.ics) con repeticiones (RRULE) diarias, semanales y mensuales.
// Alcanza para la dirección secreta de Google Calendar / Outlook sin sumar dependencias.

import { DAY, localParts, zonedToUtc, isValidTimeZone } from '../time.js';

const BYDAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const MAX_ITERATIONS = 4000;

function unfold(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function parseLine(line) {
  const colon = line.indexOf(':');
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = head.split(';');
  const params = {};
  for (const p of paramParts) {
    const [k, v = ''] = p.split('=');
    params[k.toUpperCase()] = v.replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value };
}

function unescapeText(v) {
  return v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
}

/** Fecha iCal → { ts, allDay }. Soporta UTC (Z), TZID y fecha sola (VALUE=DATE). */
export function parseIcsDate(value, params = {}, defaultTz = 'UTC') {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined || params.VALUE === 'DATE') {
    const tz = isValidTimeZone(params.TZID) ? params.TZID : defaultTz;
    return { ts: zonedToUtc(+y, +mo, +d, 0, 0, 0, tz), allDay: true };
  }
  if (z) return { ts: Date.UTC(+y, +mo - 1, +d, +h, +mi, +s), allDay: false };
  const tz = params.TZID && isValidTimeZone(params.TZID) ? params.TZID : defaultTz;
  return { ts: zonedToUtc(+y, +mo, +d, +h, +mi, +s, tz), allDay: false };
}

function parseRrule(value, defaultTz) {
  const r = {};
  for (const part of value.split(';')) {
    const [k, v] = part.split('=');
    r[k.toUpperCase()] = v;
  }
  return {
    freq: r.FREQ,
    interval: Math.max(1, Number(r.INTERVAL) || 1),
    count: r.COUNT ? Number(r.COUNT) : null,
    until: r.UNTIL ? parseIcsDate(r.UNTIL, {}, defaultTz)?.ts ?? null : null,
    byday: r.BYDAY ? r.BYDAY.split(',').map((d) => BYDAY[d.slice(-2)]).filter((d) => d !== undefined) : null,
  };
}

/** Texto .ics → lista de eventos. */
export function parseICS(text, defaultTz = 'UTC') {
  const events = [];
  let cur = null;
  for (const raw of unfold(text)) {
    const line = raw.trimEnd();
    if (line === 'BEGIN:VEVENT') {
      cur = { exdates: [], rrule: null, status: 'CONFIRMED' };
      continue;
    }
    if (line === 'END:VEVENT') {
      if (cur && cur.start !== undefined) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const p = parseLine(line);
    if (!p) continue;
    switch (p.name) {
      case 'UID':
        cur.uid = p.value;
        break;
      case 'SUMMARY':
        cur.summary = unescapeText(p.value);
        break;
      case 'STATUS':
        cur.status = p.value.toUpperCase();
        break;
      case 'DTSTART': {
        const d = parseIcsDate(p.value, p.params, defaultTz);
        if (d) {
          cur.start = d.ts;
          cur.allDay = d.allDay;
        }
        break;
      }
      case 'DTEND': {
        const d = parseIcsDate(p.value, p.params, defaultTz);
        if (d) cur.end = d.ts;
        break;
      }
      case 'RRULE':
        cur.rrule = parseRrule(p.value, defaultTz);
        break;
      case 'EXDATE':
        for (const v of p.value.split(',')) {
          const d = parseIcsDate(v, p.params, defaultTz);
          if (d) cur.exdates.push(d.ts);
        }
        break;
      case 'RECURRENCE-ID': {
        const d = parseIcsDate(p.value, p.params, defaultTz);
        if (d) cur.recurrenceId = d.ts;
        break;
      }
      default:
        break;
    }
  }
  return events;
}

/** Instancias de un evento repetitivo (instantes de inicio), en orden, hasta `to`. */
function* expand(ev, to, tz) {
  const r = ev.rrule;
  let emitted = 0;
  const limit = (ts) => ts >= to || (r.until !== null && ts > r.until) || (r.count !== null && emitted >= r.count);

  if (r.freq === 'DAILY') {
    for (let k = 0; k < MAX_ITERATIONS; k++) {
      const ts = ev.start + k * r.interval * DAY;
      if (limit(ts)) return;
      emitted++;
      yield ts;
    }
  } else if (r.freq === 'WEEKLY') {
    const startWd = localParts(ev.start, tz).weekday;
    const days = r.byday && r.byday.length ? r.byday : [startWd];
    // semanas contadas desde el lunes de la semana del inicio (WKST=MO)
    const mondayOffset = (startWd + 6) % 7;
    for (let k = 0; k < MAX_ITERATIONS; k++) {
      const ts = ev.start + k * DAY;
      if (limit(ts)) return;
      const wd = localParts(ts, tz).weekday;
      const week = Math.floor((k + mondayOffset) / 7);
      if (week % r.interval === 0 && days.includes(wd)) {
        emitted++;
        yield ts;
      }
    }
  } else if (r.freq === 'MONTHLY') {
    const p = localParts(ev.start, tz);
    for (let k = 0; k < MAX_ITERATIONS / 30; k++) {
      const monthIndex = p.month - 1 + k * r.interval;
      const y = p.year + Math.floor(monthIndex / 12);
      const mo = (monthIndex % 12) + 1;
      const ts = zonedToUtc(y, mo, p.day, p.hour, p.minute, p.second, tz);
      if (localParts(ts, tz).day !== p.day) continue; // ej. día 31 en un mes de 30
      if (limit(ts)) return;
      emitted++;
      yield ts;
    }
  } else if (r.freq === 'YEARLY') {
    const p = localParts(ev.start, tz);
    for (let k = 0; k < 50; k++) {
      const ts = zonedToUtc(p.year + k * r.interval, p.month, p.day, p.hour, p.minute, p.second, tz);
      if (limit(ts)) return;
      emitted++;
      yield ts;
    }
  }
}

/**
 * Instancias de eventos que empiezan en [from, to), ordenadas.
 * Respeta EXDATE, excepciones (RECURRENCE-ID) y eventos cancelados.
 */
export function occurrencesBetween(events, from, to, tz = 'UTC') {
  const overrides = new Map(); // uid → Set de instantes originales reemplazados
  for (const ev of events) {
    if (ev.recurrenceId !== undefined && ev.uid) {
      if (!overrides.has(ev.uid)) overrides.set(ev.uid, new Set());
      overrides.get(ev.uid).add(ev.recurrenceId);
    }
  }

  const out = [];
  for (const ev of events) {
    if (ev.status === 'CANCELLED') continue;
    const duration = ev.end !== undefined ? ev.end - ev.start : 0;
    const push = (start) => out.push({ uid: ev.uid, summary: ev.summary || '(sin título)', start, end: start + duration, allDay: Boolean(ev.allDay) });

    if (!ev.rrule || ev.recurrenceId !== undefined) {
      if (ev.start >= from && ev.start < to) push(ev.start);
      continue;
    }
    const skip = new Set([...ev.exdates, ...(overrides.get(ev.uid) || [])]);
    for (const ts of expand(ev, to, tz)) {
      if (ts >= from && !skip.has(ts)) push(ts);
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
