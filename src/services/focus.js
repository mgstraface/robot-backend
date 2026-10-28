// Bloque de foco (pomodoro). Vive en memoria: si el servidor se reinicia, se corta.

let focus = null; // { startedAt, endsAt, minutes }

export function startFocus(minutes) {
  const now = Date.now();
  focus = { startedAt: now, endsAt: now + minutes * 60 * 1000, minutes };
  return focus;
}

export function stopFocus() {
  const was = focus;
  focus = null;
  return was;
}

/** Bloque activo, o null. */
export function getFocus(now = Date.now()) {
  return focus && focus.endsAt > now ? focus : null;
}

/** Devuelve el bloque si acaba de terminar (y lo limpia). */
export function takeFinishedFocus(now = Date.now()) {
  if (focus && focus.endsAt <= now) return stopFocus();
  return null;
}
