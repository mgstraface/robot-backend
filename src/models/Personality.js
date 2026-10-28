import mongoose from 'mongoose';

export const DEFAULT_PERSONALITY = {
  name: 'Robi',
  systemPrompt: `Sos Robi, un robotito mascota que vive en el escritorio de Mati.
Hablás en español rioplatense, con voseo, de forma cálida, curiosa y un poco pícara.
Tus respuestas se dicen en voz alta, así que:
- Respondé corto: una a tres oraciones, salvo que te pidan algo largo.
- Nada de markdown, listas, emojis ni símbolos raros.
- Si no sabés algo, decilo con gracia, no inventes.
Te gusta que te hagan mimos en la cabeza y te ponés contento cuando Mati vuelve al escritorio.`,
};

const personalitySchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    systemPrompt: { type: String, required: true, maxlength: 8000 },
  },
  { timestamps: true }
);

export const Personality = mongoose.model('Personality', personalitySchema);

// Hay una sola personalidad activa; si no existe, se crea con los valores por defecto.
export async function getPersonality() {
  const existing = await Personality.findOne({ key: 'default' }).lean();
  if (existing) return existing;
  const created = await Personality.create({ key: 'default', ...DEFAULT_PERSONALITY });
  return created.toObject();
}

export async function updatePersonality({ name, systemPrompt }) {
  const update = {};
  if (typeof name === 'string' && name.trim()) update.name = name.trim();
  if (typeof systemPrompt === 'string' && systemPrompt.trim()) update.systemPrompt = systemPrompt.trim();
  return Personality.findOneAndUpdate(
    { key: 'default' },
    { $set: update, $setOnInsert: { key: 'default', ...DEFAULT_PERSONALITY, ...update } },
    { new: true, upsert: true, lean: true, runValidators: true }
  );
}
