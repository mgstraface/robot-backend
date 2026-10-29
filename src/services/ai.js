import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { AI_EMOTIONS, GESTURES, parseReply } from '../emotions.js';
import { Message } from '../models/Message.js';
import { getPersonality } from '../models/Personality.js';
import { getSettings } from '../models/Settings.js';
import { runCommand } from './commands.js';
import { isHalloween } from './extras.js';
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
Ejemplo: [feliz] ¡Qué bueno verte de nuevo!
Podés mover la cabeza: si tiene sentido, agregá después de la emoción un gesto entre corchetes (${GESTURES.join(', ')}).
Usalo sobre todo para responder sí (asentir) o no (negar). Ejemplo: [feliz] [asentir] ¡Obvio que sí!`;

const TZ = 'America/Argentina/Buenos_Aires';

export function buildSystemPrompt(personality, now = new Date(), { focus = null, futbol = false } = {}) {
  const fecha = now.toLocaleString('es-AR', {
    timeZone: TZ,
    dateStyle: 'full',
    timeStyle: 'short',
  });
  let prompt = `${personality.systemPrompt.trim()}\n\nFecha y hora actual: ${fecha}.\n${EMOTION_INSTRUCTIONS}`;
  if (isHalloween(now.getTime())) {
    prompt +=
      '\n\nHoy es Halloween: estás en modo terror todo el día. Respondé con onda tenebrosa y divertida, ' +
      'alguna risa macabra (jejeje) y referencias a fantasmas, calaveras y películas de terror, sin dejar de ayudar.';
  }
  if (futbol) {
    prompt +=
      "\n\nSos hincha fanático de Newell's Old Boys (la Lepra, de Rosario), igual que tu dueño: conocés su historia " +
      '(el Coloso Marcelo Bielsa, Bielsa, Messi en las inferiores, los campeonatos) y chicaneás a los de Rosario Central (canallas) con buena onda. ' +
      'Sacalo solo cuando venga al caso, no en cada respuesta.';
  }
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

  // Primero los comandos que no necesitan IA (hora, clima, timers, alarmas…): gratis e instantáneos
  const command = await (deps.runCommand || runCommand)(userText);
  if (command) {
    await Message.insertMany([
      { deviceId, role: 'user', text: userText, source },
      { deviceId, role: 'assistant', text: command.text, emotion: command.emotion, source },
    ]);
    return { ...command, command: true };
  }

  const personality = await getPersonality();
  const recent = await Message.find({ deviceId })
    .sort({ createdAt: -1 })
    .limit(config.ai.historyLimit)
    .lean();

  const messages = buildHistory([...recent.reverse(), { role: 'user', text: userText }]);
  const raw = await model({ system: buildSystemPrompt(personality, new Date(), { focus: getFocus(), futbol: (await getSettings()).futbol }), messages });
  const { emotion, gesture, text: reply } = parseReply(raw);
  const finalText = reply || '...';

  await Message.insertMany([
    { deviceId, role: 'user', text: userText, source },
    { deviceId, role: 'assistant', text: finalText, emotion, source },
  ]);

  return { text: finalText, emotion, gesture };
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
  const { emotion, gesture, text } = parseReply(raw);
  const finalText = text || '...';
  await Message.create({ deviceId: 'avisos', role: 'assistant', text: finalText, emotion, source: 'text' });
  return { text: finalText, emotion, gesture };
}
