import http from 'node:http';
import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import { config } from './config.js';
import apiRouter from './routes/api.js';
import { loadReminders } from './services/reminders.js';
import { loadMood } from './services/mood.js';
import { startScheduler } from './services/scheduler.js';
import { attachRobotSocket } from './ws/robotSocket.js';

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '200kb' }));

app.use('/api', apiRouter);

app.use((req, res) => res.status(404).json({ error: 'No encontrado' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  // Un 401/403 que viene de un servicio de afuera (IA, voz…) no es del panel: si lo devolvemos tal cual,
  // el panel cree que la clave de admin está mal y cierra la sesión. Lo pasamos como 502 con el mensaje real.
  let status = Number(err.status) >= 400 && Number(err.status) < 600 ? Number(err.status) : 500;
  let message = err.message || 'Error interno';
  if (status === 401 || status === 403) {
    status = 502;
    message = `Falló un servicio externo (${err.status}): ${message}`;
  }
  res.status(status).json({ error: message });
});

const server = http.createServer(app);
attachRobotSocket(server);

async function start() {
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB conectado');
  startScheduler();
  await loadReminders();
  await loadMood();
  server.listen(config.port, () => {
    console.log(`robot-backend escuchando en :${config.port}`);
    console.log(`  REST      → http://localhost:${config.port}/api`);
    console.log(`  WebSocket → ws://localhost:${config.port}/ws/robot?deviceId=robot-1&token=...`);
  });
}

start().catch((err) => {
  console.error('No se pudo iniciar:', err);
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  });
}
