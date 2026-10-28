import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { AI_EMOTIONS, parseEmotion } from '../emotions.js';
import { Message } from '../models/Message.js';
import { getPersonality } from '../models/Personality.js';

let client = null;
function getClient() {
  if (!config.ai.apiKey) {
    throw new Error('Falta ANTHROPIC_API_KEY en el .env');
  }
  if (!client) client = new Anthropic({ apiKey: config.ai.apiKey });
  return client;
}

const EMOTION_INSTRUCTIONS = `
Formato obligatorio: empezá SIEMPRE tu respuesta con tu emoción entre corchetes y después el texto.
Emociones posibles: ${AI_EMOTIONS.join(', ')}.
Ejemplo: [feliz] ¡Qué bueno verte de nuevo!`;

export function buildSystemPrompt(personality, now = new Date()) {
  const fecha = now.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'full',
    timeStyle: 'short',
  });
  return `${personality.systemPrompt.trim()}\n\nFecha y hora actual: ${fecha}.\n${EMOTION_INSTRUCTIONS}`;
}

/**
 * Convierte el historial guardado al formato que pide la API:
 * tiene que arrancar con "user" y alternar roles. Une mensajes consecutivos del mismo rol.
 */
export function buildHistory(messages) {
  const out = [];
  for (const m of messages) {
    if (!m.text) continue;
    if (out.length === 0 && m.role !== 'user') continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      last.content += `\n${m.text}`;
    } else {
      out.push({ role: m.role, content: m.text });
    }
  }
  return out;
}

/** Llama al modelo con el historial + el mensaje nuevo. Separado para poder reemplazarlo en tests. */
export async function callModel({ system, messages }) {
  const response = await getClient().messages.create({
    model: config.ai.model,
    max_tokens: config.ai.maxTokens,
    system,
    messages,
  });
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

/**
 * Conversa con la mascota: arma el contexto (personalidad + últimos mensajes de ese dispositivo),
 * llama a la IA, guarda ambos mensajes y devuelve { text, emotion }.
 */
export async function chat({ deviceId, text, source = 'text' }, deps = {}) {
  const model = deps.callModel || callModel;
  const userText = String(text || '').trim();
  if (!userText) throw new Error('Mensaje vacío');

  const personality = await getPersonality();
  const recent = await Message.find({ deviceId })
    .sort({ createdAt: -1 })
    .limit(config.ai.historyLimit)
    .lean();

  const messages = buildHistory([...recent.reverse(), { role: 'user', text: userText }]);
  const raw = await model({ system: buildSystemPrompt(personality), messages });
  const { emotion, text: reply } = parseEmotion(raw);
  const finalText = reply || '...';

  await Message.insertMany([
    { deviceId, role: 'user', text: userText, source },
    { deviceId, role: 'assistant', text: finalText, emotion, source },
  ]);

  return { text: finalText, emotion };
}
