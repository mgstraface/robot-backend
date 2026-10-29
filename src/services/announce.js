// Avisos que el robot da por su cuenta (saludo, reuniones, agua, foco, deploys, sustos).
// Llegan a los robots conectados por WebSocket y al panel por el "feed", que el panel consulta cada pocos segundos.
import { broadcast, setEmotion, speak } from '../ws/robotSocket.js';

const MAX_FEED = 50;
const feed = [];
let seq = 0;

export function pushFeed(item) {
  const entry = { id: ++seq, at: new Date().toISOString(), ...item };
  feed.push(entry);
  if (feed.length > MAX_FEED) feed.shift();
  return entry;
}

/** Entradas posteriores a `after`. Con after < 0 devuelve solo el último id (para no repetir avisos viejos). */
export function feedAfter(after) {
  if (after < 0) return { lastId: seq, items: [] };
  return { lastId: seq, items: feed.filter((e) => e.id > after) };
}

/**
 * Hace que el robot (y el panel) digan o hagan algo.
 * @param {{kind:string, text?:string, emotion?:string, actions?:string[], weather?:string}} a
 */
export async function announce({ kind, text = '', emotion = 'neutral', actions = [], weather, gesture }) {
  const entry = pushFeed({ kind, text, emotion, actions, weather, gesture });
  for (const action of actions) broadcast({ type: 'action', action, ...(weather ? { weather } : {}) });
  if (gesture) broadcast({ type: 'gesture', gesture });
  try {
    if (text) await speak(undefined, text, emotion);
    else if (emotion && emotion !== 'neutral') setEmotion(undefined, emotion);
  } catch (err) {
    console.error('[announce] no se pudo mandar al robot:', err.message);
  }
  return entry;
}
