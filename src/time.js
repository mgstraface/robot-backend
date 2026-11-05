// Utilidades de fecha y hora en una zona horaria (sin dependencias).

const DAY = 24 * 60 * 60 * 1000;
export { DAY };

const formatters = new Map();
function formatter(tz) {
  if (!formatters.has(tz)) {
    formatters.set(
      tz,
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'short',
      })
    );
  }
  return formatters.get(tz);
}

export function isValidTimeZone(tz) {
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Partes de la fecha/hora local de `ts` en la zona `tz`. weekday: 0 = domingo. */
export function localParts(ts, tz) {
  const parts = Object.fromEntries(formatter(tz).formatToParts(new Date(ts)).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday],
  };
}

/** Diferencia (ms) entre la hora local de la zona y UTC en el instante `ts`. */
export function tzOffsetMs(tz, ts) {
  const p = localParts(ts, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** Convierte una fecha/hora "de reloj" en la zona `tz` al instante UTC correspondiente. */
export function zonedToUtc(year, month, day, hour, minute, second, tz) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  let ts = guess - tzOffsetMs(tz, guess);
  const second_try = guess - tzOffsetMs(tz, ts);
  if (second_try !== ts) ts = second_try; // cambios de horario
  return ts;
}

/** Instante en que empieza el día local que contiene `ts`. */
export function startOfLocalDay(ts, tz) {
  const p = localParts(ts, tz);
  return zonedToUtc(p.year, p.month, p.day, 0, 0, 0, tz);
}

/** ¿La hora local `hour` cae en el horario de dormir [from, to)? Soporta rangos que cruzan medianoche. */
export function isSleepHour(hour, from, to) {
  if (from === to) return false;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

export function formatTime(ts, tz) {
  return new Date(ts).toLocaleTimeString('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}
