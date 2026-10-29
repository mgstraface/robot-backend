// Newell's en vivo: próximos partidos, goles y resultados desde los marcadores públicos de ESPN (gratis, sin clave).
// El scheduler llama a futbolTick() cada minuto; solo consulta seguido mientras hay partido.
import { announce } from './announce.js';
import { pick } from './phrases.js';
import { formatTime } from '../time.js';

const TEAM_ID = process.env.FUTBOL_TEAM_ID || '14'; // Newell's Old Boys en ESPN
const LEAGUE = process.env.FUTBOL_LEAGUE || 'arg.1';
const RIVAL_NAME = /rosario central/i;
const BASE = `https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUE}`;

const SCHEDULE_MS = 30 * 60 * 1000;
let scheduleCache = { at: 0, events: [] };

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`ESPN respondió ${res.status}`);
  return res.json();
}

function scoreOf(c) {
  const s = c?.score;
  const v = typeof s === 'object' && s !== null ? s.value ?? s.displayValue : s;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Normaliza un evento de ESPN a lo que usamos. Pura, para testear. */
export function parseEvent(ev, teamId = TEAM_ID) {
  const comp = ev?.competitions?.[0];
  const cs = comp?.competitors || [];
  if (cs.length !== 2) return null;
  const side = (c) => ({
    id: String(c.team?.id ?? c.id ?? ''),
    name: c.team?.shortDisplayName || c.team?.displayName || '?',
    fullName: c.team?.displayName || '',
    score: scoreOf(c),
    home: c.homeAway === 'home',
  });
  const [a, b] = cs.map(side);
  const status = comp.status || ev.status || {};
  const base = {
    id: String(ev.id),
    date: new Date(ev.date || comp.date).getTime(),
    state: status.type?.state || 'pre', // pre | in | post
    detail: status.type?.shortDetail || status.type?.detail || '',
    teams: [a, b],
  };
  const us = [a, b].find((t) => t.id === String(teamId));
  if (!us) return base;
  const rival = us === a ? b : a;
  return { ...base, ours: true, us, rival };
}

export async function getSchedule(now = Date.now()) {
  if (now - scheduleCache.at < SCHEDULE_MS) return scheduleCache.events;
  const d = await getJson(`${BASE}/teams/${TEAM_ID}/schedule`);
  const events = (d.events || []).map((e) => parseEvent(e)).filter((e) => e?.ours);
  scheduleCache = { at: now, events };
  return events;
}

async function getScoreboard() {
  const d = await getJson(`${BASE}/scoreboard`);
  return (d.events || []).map((e) => parseEvent(e)).filter(Boolean);
}

export function nextMatch(events, now = Date.now()) {
  return events.filter((e) => e.state !== 'post' && e.date > now - 3 * 3600_000).sort((x, y) => x.date - y.date)[0] || null;
}

export function lastMatch(events) {
  return events.filter((e) => e.state === 'post').sort((x, y) => y.date - x.date)[0] || null;
}

function resultWord(m) {
  if (m.us.score === null || m.rival.score === null) return '';
  return m.us.score > m.rival.score ? 'ganamos' : m.us.score < m.rival.score ? 'perdimos' : 'empatamos';
}

function dayText(ts, tz, now) {
  const fmt = (t) => new Date(t).toLocaleDateString('es-AR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'numeric' });
  if (fmt(ts) === fmt(now)) return 'hoy';
  if (fmt(ts) === fmt(now + 86_400_000)) return 'mañana';
  return `el ${fmt(ts)}`;
}

/** Respuestas para los comandos "¿cuándo juega Newell's?" y "¿cómo salió Newell's?". */
export async function matchAnswer(kind, tz, now = Date.now()) {
  const events = await getSchedule(now);
  if (kind === 'cuando') {
    const m = nextMatch(events, now);
    if (!m) return { text: pick('futbolSinFecha'), emotion: 'triste' };
    if (m.state === 'in') return { text: pick('futbolEnVivo', { us: m.us.score, rival: m.rival.score, contra: m.rival.name, detalle: m.detail }), emotion: 'sorprendido' };
    return {
      text: pick('futbolProximo', { cuando: dayText(m.date, tz, now), hora: formatTime(m.date, tz), contra: m.rival.name, donde: m.us.home ? 'en el Coloso' : 'de visitante' }),
      emotion: 'feliz',
    };
  }
  const m = events.find((e) => e.state === 'in') || lastMatch(events);
  if (!m) return { text: pick('futbolSinFecha'), emotion: 'neutral' };
  if (m.state === 'in') return { text: pick('futbolEnVivo', { us: m.us.score, rival: m.rival.score, contra: m.rival.name, detalle: m.detail }), emotion: 'sorprendido' };
  const r = resultWord(m);
  return {
    text: pick(`futbol_${r || 'empatamos'}`, { us: m.us.score, rival: m.rival.score, contra: m.rival.name }),
    emotion: r === 'ganamos' ? 'riendo' : r === 'perdimos' ? 'triste' : 'neutral',
    gesture: r === 'ganamos' ? 'asentir' : r === 'perdimos' ? 'negar' : undefined,
  };
}

// ---------- seguimiento automático

const state = { live: new Map(), announced: new Set(), lastBoardAt: 0 };
const once = (key) => (state.announced.has(key) ? false : (state.announced.add(key), true));

/** Compara el marcador anterior con el nuevo y devuelve los avisos a dar. Pura, para testear. */
export function diffMatch(prev, m) {
  const out = [];
  if (!prev) return out;
  if (m.us.score !== null && prev.us !== null && m.us.score > prev.us) out.push('gol');
  if (m.rival.score !== null && prev.rival !== null && m.rival.score > prev.rival) out.push('golRival');
  return out;
}

export async function futbolTick({ now = Date.now(), tz, sleeping = false }) {
  const events = await getSchedule(now);
  const m = nextMatch(events, now);
  const vars = (x) => ({ contra: x.rival.name, us: x.us.score, rival: x.rival.score, hora: formatTime(x.date, tz) });

  if (m && !sleeping) {
    const minsTo = (m.date - now) / 60_000;
    // a la mañana del día del partido (o apenas se despierta)
    if (minsTo > 60 && minsTo < 16 * 60 && dayText(m.date, tz, now) === 'hoy' && once(`hoy:${m.id}`)) {
      await announce({ kind: 'futbol', text: pick(RIVAL_NAME.test(m.rival.fullName) ? 'futbolHoyClasico' : 'futbolHoy', vars(m)), emotion: 'feliz' });
    }
    if (minsTo > 0 && minsTo <= 30 && once(`previa:${m.id}`)) {
      await announce({ kind: 'futbol', text: pick('futbolPrevia', vars(m)), emotion: 'sorprendido', actions: ['bandera'] });
    }
  }

  // Mientras hay partido nuestro (desde el arranque hasta 3 h después) o cada 15 min para ver a Central
  const ours = m && now >= m.date - 5 * 60_000 && now <= m.date + 3 * 3600_000;
  if (!ours && now - state.lastBoardAt < 15 * 60_000) return;
  state.lastBoardAt = now;
  const board = await getScoreboard();

  for (const ev of board) {
    // Central perdió: chicana
    const central = ev.teams.find((t) => RIVAL_NAME.test(t.fullName) || RIVAL_NAME.test(t.name));
    if (central && ev.state === 'post' && !ev.teams.some((t) => t.id === TEAM_ID)) {
      const other = ev.teams.find((t) => t !== central);
      if (central.score !== null && other.score !== null && central.score < other.score && once(`central:${ev.id}`) && !sleeping) {
        await announce({ kind: 'futbol', text: pick('futbolCentralPerdio', { contra: other.name }), emotion: 'picaro' });
      }
    }
  }

  const match = board.find((e) => e.ours);
  if (!match) return;
  const prev = state.live.get(match.id);
  for (const what of diffMatch(prev, match)) {
    if (what === 'gol') await announce({ kind: 'futbol', text: pick('futbolGol', vars(match)), emotion: 'riendo', actions: ['gol'], gesture: 'asentir' });
    else await announce({ kind: 'futbol', text: pick('futbolGolRival', vars(match)), emotion: 'enojado', gesture: 'negar' });
  }
  state.live.set(match.id, { us: match.us.score, rival: match.rival.score });
  if (match.state === 'post' && once(`final:${match.id}`)) {
    const r = resultWord(match) || 'empatamos';
    await announce({
      kind: 'futbol',
      text: pick(`futbolFinal_${r}`, vars(match)),
      emotion: r === 'ganamos' ? 'riendo' : r === 'perdimos' ? 'triste' : 'neutral',
      actions: r === 'ganamos' ? ['bandera'] : [],
    });
  }
}
