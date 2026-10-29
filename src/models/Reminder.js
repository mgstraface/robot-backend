import mongoose from 'mongoose';

// Timers, alarmas y recordatorios pedidos por voz o texto ("avisame en 10 minutos", "despertame a las 7").
const reminderSchema = new mongoose.Schema(
  {
    at: { type: Date, required: true, index: true },
    kind: { type: String, enum: ['timer', 'alarma', 'recordatorio'], default: 'timer' },
    text: { type: String, default: '', maxlength: 200 }, // de qué avisar ("sacar la ropa")
    done: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Reminder = mongoose.model('Reminder', reminderSchema);
