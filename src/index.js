import http from 'node:http';
import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import { config } from './config.js';
import apiRouter from './routes/api.js';
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
  res.status(err.status || 500).json({ error: err.message || 'Error interno' });
});

const server = http.createServer(app);
attachRobotSocket(server);

async function start() {
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB conectado');
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
