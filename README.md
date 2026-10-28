# robot-backend

Cerebro del robot mascota. El robot (ESP32-S3) solo escucha, habla, muestra caras y mueve servos; todo lo demás pasa acá:

```
 ESP32 ──WebSocket──▶ robot-backend ──▶ Transcripción (STT)
   ▲                       │         ──▶ Claude (respuesta + emoción)
   │                       │         ──▶ Voz (TTS)
   └──── audio + emoción ──┘         ──▶ MongoDB (memoria y personalidad)

 robot-frontend (panel) ──REST──▶ robot-backend
```

- **Express** para la API del panel (`/api/...`, protegida con `ADMIN_TOKEN`).
- **WebSocket** en `/ws/robot` para el robot (protegido con `DEVICE_TOKEN`).
- **MongoDB** guarda la personalidad y el historial de conversación (la "memoria").
- **Claude** genera las respuestas. Cada respuesta trae una emoción para la cara.
- **Voz** opcional (OpenAI STT/TTS). Con `VOICE_PROVIDER=none` todo funciona en modo texto, ideal mientras no tengas el hardware.

## Correr en local

```bash
cp .env.example .env     # completar ANTHROPIC_API_KEY, tokens y MONGO_URI
npm install
npm run dev
npm test                 # tests unitarios (no necesitan Mongo)
```

## API del panel

Todas (salvo `/api/health`) llevan `Authorization: Bearer <ADMIN_TOKEN>`.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/health` | Estado del servicio |
| GET | `/api/config` | Modelo, si hay voz y lista de emociones |
| GET / PUT | `/api/personality` | Ver / editar nombre y prompt de personalidad |
| GET | `/api/messages?deviceId=&limit=` | Historial de conversación |
| DELETE | `/api/messages?deviceId=` | Borrar memoria |
| GET | `/api/robot/status` | Robots conectados y últimos eventos |
| POST | `/api/robot/expression` | `{ deviceId?, emotion }` cambia la cara |
| POST | `/api/robot/say` | `{ deviceId?, text, emotion? }` le hace decir algo |
| POST | `/api/chat` | `{ text, deviceId?, speakOn? }` chatear con la personalidad |

## Protocolo del robot (WebSocket)

Conexión: `wss://robot.tudominio.com/ws/robot?deviceId=robot-1&token=<DEVICE_TOKEN>`

**Robot → servidor**

| Mensaje | Uso |
|---|---|
| `{"type":"hello","firmware":"0.1"}` | Al conectar |
| `{"type":"listen_start"}` | Empieza a grabar (ej. al tocar la cabeza o detectar voz) |
| *binario* | Audio PCM 16 kHz, 16 bits, mono, en bloques |
| `{"type":"listen_end"}` | Terminó de grabar → el servidor transcribe y responde |
| `{"type":"text","text":"hola"}` | Mensaje de texto (para probar sin micrófono) |
| `{"type":"touch","zone":"cabeza"}` | Toque en un sensor (`cabeza`, `panza`, `espalda`) |
| `{"type":"ping"}` | Keepalive |

**Servidor → robot**

| Mensaje | Uso |
|---|---|
| `{"type":"welcome","voice":true}` | Conexión aceptada |
| `{"type":"emotion","emotion":"pensando"}` | Cambiar la cara |
| `{"type":"transcript","text":"..."}` | Lo que entendió |
| `{"type":"reply","text":"...","emotion":"feliz"}` | La respuesta |
| `{"type":"audio_start","sampleRate":24000}` + *binario* + `{"type":"audio_end"}` | Voz PCM 24 kHz para el parlante |
| `{"type":"error","message":"..."}` | Algo falló (la cara pasa a `triste`) |

Emociones: `neutral, feliz, triste, sorprendido, enojado, pensando, dormido, amor, curioso, escuchando`.

Para probar el WebSocket sin hardware: `npx wscat -c "ws://localhost:4100/ws/robot?deviceId=robot-1&token=..."` y mandar `{"type":"text","text":"hola"}`.

## Deploy en el VPS (Docker)

Todo corre en contenedores: `robot-backend`, `robot-mongo` (Mongo propio, no toca el de otros proyectos) y `robot-panel` (nginx con el panel, que además reenvía `/api` y `/ws` al backend). Solo se publica un puerto en el host: `127.0.0.1:8090`.

```bash
git clone git@github.com:mgstraface/robot-backend.git /root/robot/robot-backend
bash /root/robot/robot-backend/scripts/deploy-vps.sh
```

El script clona también `robot-frontend`, crea el `.env` con tokens nuevos y se frena para que completes `ANTHROPIC_API_KEY`. Después lo corrés de nuevo y levanta todo. Para actualizar, el mismo comando.

Por último, el proxy principal del VPS tiene que mandar `robot.malestraface.com` → `127.0.0.1:8090`, con soporte de WebSocket para `/ws/` (headers `Upgrade` y `Connection`, timeout largo).

## Notas

- Corre como **una sola instancia**: los robots conectados viven en memoria.
- La latencia total (STT + IA + TTS) depende de dónde esté el VPS. Para disimularla, el servidor manda `pensando` apenas recibe el audio.
