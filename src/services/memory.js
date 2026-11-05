// Memoria de largo plazo: datos cortos que la IA decide recordar ("[recordar: ...]") o que cargás a mano.
// Se suman al prompt para que Robi se acuerde de cosas de días anteriores sin mandar todo el historial.
import mongoose from 'mongoose';

const MAX_RECUERDOS = 60;
const EN_PROMPT = 25;

const memorySchema = new mongoose.Schema({ text: { type: String, maxlength: 200, required: true } }, { timestamps: true });
export const Memory = mongoose.models?.Memory || mongoose.model('Memory', memorySchema);

/** Saca los "[recordar: …]" de la respuesta. Pura, para testear. */
export function extractMemories(text) {
  const found = [];
  const clean = String(text || '')
    .replace(/\[recordar:\s*([^\]]{2,200})\]/gi, (_, m) => {
      found.push(m.trim());
      return '';
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { text: clean, memories: found };
}

export async function remember(texts) {
  for (const t of texts) {
    const text = t.slice(0, 200);
    const exists = await Memory.findOne({ text: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).lean();
    if (!exists) await Memory.create({ text });
  }
  const count = await Memory.countDocuments();
  if (count > MAX_RECUERDOS) {
    const old = await Memory.find().sort({ createdAt: 1 }).limit(count - MAX_RECUERDOS).select('_id').lean();
    await Memory.deleteMany({ _id: { $in: old.map((o) => o._id) } });
  }
}

export async function listMemories() {
  return Memory.find().sort({ createdAt: -1 }).lean();
}

/** Texto para el prompt: los más recientes primero. */
export async function memoriesForPrompt() {
  const list = await Memory.find().sort({ createdAt: -1 }).limit(EN_PROMPT).lean();
  return list.map((m) => `- ${m.text}`).join('\n');
}
