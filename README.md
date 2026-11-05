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

La base de datos es la del VPS (misma memoria y personalidad que producción). Mongo no está expuesto a internet: se llega por un túnel SSH que dejás abierto en otra terminal mientras desarrollás:

```bash
ssh -p 5514 -N -L 27020:127.0.0.1:27020 root@149.50.145.115
```

Y en el `.env` local: `MONGO_URI=mongodb://127.0.0.1:27020/robot`

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
| GET / PUT | `/api/personality` | Ver / editar nombre, prompt, `eyeColor` y `faceStyle` (`tierno` o `terror`) |
| GET | `/api/messages?deviceId=&limit=` | Historial de conversación |
| DELETE | `/api/messages?deviceId=` | Borrar memoria |
| GET | `/api/robot/status` | Robots conectados y últimos eventos |
| POST | `/api/robot/expression` | `{ deviceId?, emotion }` cambia la cara |
| POST | `/api/robot/say` | `{ deviceId?, text, emotion? }` le hace decir algo |
| GET / POST / DELETE | `/api/photos` | Fotos del portarretrato (JPEG ya achicado; GET acepta también el token del robot) |
| POST | `/api/try/:kind` | Probar una rutina: `saludo`, `agua`, `reunion`, `deploy-ok`, `deploy-falla`, `susto`, `foco-fin` |
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
| `{"type":"motion","event":"sacudir"}` | Sensor de movimiento: `sacudir` (mareado), `levantar` (sorprendido), `caer` (triste) |
| `{"type":"ping"}` | Keepalive |

**Servidor → robot**

| Mensaje | Uso |
|---|---|
| `{"type":"welcome","voice":true}` | Conexión aceptada |
| `{"type":"appearance","eyeColor":"#d93a2b","faceStyle":"terror"}` | Color de las facciones y estilo de cara (al conectar y cada vez que cambia en el panel) |
| `{"type":"emotion","emotion":"pensando"}` | Cambiar la cara |
| `{"type":"photos","changed":true}` | Cambiaron las fotos del portarretrato: el robot vuelve a sincronizar su SD con `GET /api/photos` y `GET /api/photos/:id` (con su token) |
| `{"type":"action","action":"clima","weather":"lluvia"}` | Animación puntual: `apagon`, `risa`, `lagrima`, `colmillos`, `tercerOjo`, `clima` |
| `{"type":"transcript","text":"..."}` | Lo que entendió |
| `{"type":"reply","text":"...","emotion":"feliz"}` | La respuesta |
| `{"type":"audio_start","sampleRate":24000}` + *binario* + `{"type":"audio_end"}` | Voz PCM 24 kHz para el parlante |
| `{"type":"error","message":"..."}` | Algo falló (la cara pasa a `triste`) |

Emociones: `neutral, feliz, triste, sorprendido, enojado, pensando, dormido, amor, curioso, escuchando, mareado`.

## Rutinas

Una vez por minuto el servidor revisa (`src/services/scheduler.js`), con los ajustes de la pestaña **Rutinas** del panel:

- **Saludo** al despertarse (fin del horario de dormir): hora, clima (Open-Meteo, sin API key) y agenda del día.
- **Reuniones**: avisa N minutos antes, leyendo la dirección secreta iCal del calendario (Google Calendar → Configuración → *Dirección secreta en formato iCal*). Soporta eventos repetidos, excepciones y cancelados.
- **Agua**: recordatorio cada N minutos (no interrumpe un bloque de foco).
- **Modo susto**: N apagones con risa macabra al día, a horas al azar, solo con la cara en estilo terror.
- **Foco (pomodoro)**: `POST /api/focus {minutes}`; durante el bloque reta con humor si le hablás de otra cosa y al terminar avisa el descanso.
- **Deploys**: `POST /api/hooks/event {kind:"deploy", status:"success"|"failure", repo, env}` con el token del panel. El script de deploy lo llama solo.

Todo lo que dice por su cuenta va a los robots conectados y al panel (`GET /api/feed?after=<id>`).

Para probar el WebSocket sin hardware: `npx wscat -c "ws://localhost:4100/ws/robot?deviceId=robot-1&token=..."` y mandar `{"type":"text","text":"hola"}`.

## Deploy en el VPS (Docker)

Hay dos entornos en el mismo VPS, cada uno con sus contenedores y su propia base de datos:

| Entorno | Rama | URL | Carpeta | Panel |
|---|---|---|---|---|
| Producción | `main` | robot.malestraface.com | `/root/robot` | `127.0.0.1:8090` |
| Pruebas | `dev` | dev.robot.malestraface.com | `/root/robot-dev` | `127.0.0.1:8091` |

Todo corre en contenedores (`backend`, `mongo` y `panel`, un nginx con el panel que además reenvía `/api` y `/ws` al backend). Cada entorno publica solo puertos en `127.0.0.1`.

```bash
bash /root/robot/robot-backend/scripts/deploy-vps.sh        # producción
bash /root/robot/robot-backend/scripts/deploy-vps.sh dev    # pruebas
```

La primera vez en producción, el script crea el `.env` con tokens nuevos y se frena para que completes `ANTHROPIC_API_KEY`. El de pruebas arma su `.env` a partir del de producción (misma API key y mismo token de panel, token de robot y base propios) y además crea su sitio de nginx y pide el certificado HTTPS.

### Deploy automático

Cada push a `main` o `dev` (en este repo o en `robot-frontend`) dispara `.github/workflows/deploy.yml`, que entra al VPS por SSH y corre `scripts/deploy-vps.sh` para el entorno que corresponde. También se puede correr a mano desde la pestaña **Actions → Deploy al VPS → Run workflow**.

Secrets necesarios en **los dos repos** (Settings → Secrets and variables → Actions): `VPS_HOST`, `VPS_PORT`, `VPS_USER`, `VPS_SSH_KEY`. La clave pública está en `authorized_keys` del VPS restringida con `command=` para que solo pueda ejecutar el script de deploy.

## Notas

- Corre como **una sola instancia**: los robots conectados viven en memoria.
- La latencia total (STT + IA + TTS) depende de dónde esté el VPS. Para disimularla, el servidor manda `pensando` apenas recibe el audio.

## Voz gratis (Whisper + Piper en el VPS)

En lugar de pagar la voz de OpenAI, el VPS puede entender y hablar solo con el servicio `voz`
([speaches](https://github.com/speaches-ai/speaches): misma API que OpenAI). Usa ~1–1,5 GB de RAM.

1. En el `.env` del entorno:
   ```
   VOICE_PROVIDER=local
   COMPOSE_PROFILES=voz
   ```
2. Redeploy (`bash scripts/deploy-vps.sh` o push). Queda corriendo el contenedor `robot-voz`.
3. Bajar los modelos una sola vez (quedan guardados en el volumen):
   ```bash
   # ver las voces en español disponibles
   docker exec robot-voz curl -s 'localhost:8000/v1/registry?task=text-to-speech' | grep -o '"id":"[^"]*es_[^"]*"'
   # bajar el reconocedor y la voz elegida
   docker exec robot-voz curl -s -X POST localhost:8000/v1/models/Systran/faster-whisper-small
   docker exec robot-voz curl -s -X POST localhost:8000/v1/models/<id-de-la-voz>
   ```
4. Poner en el `.env` `TTS_MODEL=<id-de-la-voz>` (y `TTS_VOICE` con el nombre de la voz) y reiniciar el backend.
