import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { AI_EMOTIONS, parseEmotion } from '../emotions.js';
import { Message } from '../models/Message.js';
import { getPersonality } from '../models/Personality.js';
import { getFocus } from './focus.js';
import { formatTime } from '../time.js';

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

const TZ = 'America/Argentina/Buenos_Aires';

export function buildSystemPrompt(personality, now = new Date(), { focus = null } = {}) {
  const fecha = now.toLocaleString('es-AR', {
    timeZone: TZ,
    dateStyle: 'full',
    timeStyle: 'short',
  });
  let prompt = `${personality.systemPrompt.trim()}\n\nFecha y hora actual: ${fecha}.\n${EMOTION_INSTRUCTIONS}`;
  if (focus) {
    prompt +=
      `\n\nAhora hay un bloque de foco (pomodoro) hasta las ${formatTime(focus.endsAt, TZ)}. ` +
      'Si te habla de algo que no sea trabajo, retalo con humor en una sola oración y pedile que vuelva a lo suyo; ' +
      'si es por trabajo, ayudalo corto.';
  }
  return prompt;
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
  const raw = await model({ system: buildSystemPrompt(personality, new Date(), { focus: getFocus() }), messages });
  const { emotion, text: reply } = parseEmotion(raw);
  const finalText = reply || '...';

  await Message.insertMany([
    { deviceId, role: 'user', text: userText, source },
    { deviceId, role: 'assistant', text: finalText, emotion, source },
  ]);

  return { text: finalText, emotion };
}

/**
 * Genera un aviso con la voz y la personalidad del robot (saludo, recordatorio, reacción a un deploy…),
 * sin que sea parte de una conversación. Se guarda en el historial como mensaje del robot en "avisos".
 */
export async function generate(instruction, deps = {}) {
  const model = deps.callModel || callModel;
  const personality = await getPersonality();
  const raw = await model({
    system: buildSystemPrompt(personality),
    messages: [
      {
        role: 'user',
        content: `[Instrucción del sistema, no es un mensaje de la persona] ${instruction} Respondé solo con lo que vas a decir en voz alta.`,
      },
    ],
  });
  const { emotion, text } = parseEmotion(raw);
  const finalText = text || '...';
  await Message.create({ deviceId: 'avisos', role: 'assistant', text: finalText, emotion, source: 'text' });
  return { text: finalText, emotion };
}
