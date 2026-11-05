import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, index: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    text: { type: String, required: true, maxlength: 10000 },
    emotion: { type: String, default: 'neutral' },
    // De dónde vino: voz del robot, texto por WebSocket o el chat del panel
    source: { type: String, enum: ['voice', 'text', 'panel'], default: 'text' },
  },
  { timestamps: true }
);

messageSchema.index({ deviceId: 1, createdAt: -1 });

export const Message = mongoose.model('Message', messageSchema);
