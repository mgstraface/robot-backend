#include "listener.h"

#include <driver/i2s.h>
#include <math.h>

#include "config.h"
#include "speaker.h"

static const i2s_port_t PORT = I2S_NUM_0;
static const int RATE = 16000;
static const uint32_t MAX_MS = 10000;      // tope de una frase
static const uint32_t NO_VOICE_MS = 5000;  // si nadie habla en 4 s, cancela
static const uint32_t SILENCE_MS = 1100;   // pausa que cierra la frase
static const float GAIN_DIV = 32.0f;       // de 24 bits a 16 bits (voz ~ +-20000)
static const float HP_R = 0.96f;           // filtro que saca la deriva lenta (corte ~100 Hz)
static float hpX = 0, hpY = 0;

Listener listener;

// el audio se manda en bloques de 4 KB (8 por segundo) y no en cientos de mensajes chicos: con WiFi débil esos
// mensajes chicos llenan el buffer y el WebSocket se cae
static uint8_t outBuf[4096];
static size_t outLen = 0;
static void flushOut() {
  if (outLen) listenerSendBin(outBuf, outLen);
  outLen = 0;
}
static void queueOut(const uint8_t *d, size_t n) {
  while (n) {
    size_t k = min(n, sizeof(outBuf) - outLen);
    memcpy(outBuf + outLen, d, k);
    outLen += k;
    d += k;
    n -= k;
    if (outLen == sizeof(outBuf)) flushOut();
  }
}

bool Listener::start() {
  if (on_ || speaker.busy()) return false;
  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);
  cfg.sample_rate = RATE;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT;  // L/R del mic a GND: habla en el canal izquierdo
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  cfg.dma_buf_count = 8;
  cfg.dma_buf_len = 256;
  cfg.use_apll = false;
  if (i2s_driver_install(PORT, &cfg, 0, nullptr) != ESP_OK) return false;
  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = PIN_I2S_BCLK;
  pins.ws_io_num = PIN_I2S_WS;
  pins.data_out_num = I2S_PIN_NO_CHANGE;
  pins.data_in_num = PIN_I2S_MIC_DIN;
  if (i2s_set_pin(PORT, &pins) != ESP_OK) {
    i2s_driver_uninstall(PORT);
    return false;
  }
  // sin el driver de salida el pin del ampli quedaría flotando y el parlante haría ruido
  pinMode(PIN_I2S_AMP_DOUT, OUTPUT);
  digitalWrite(PIN_I2S_AMP_DOUT, LOW);
  outLen = 0;
  hpX = hpY = 0;
  on_ = true;
  t0_ = millis();
  lastVoice_ = t0_;
  heardVoice_ = false;
  noise_ = 0;
  calibN_ = 0;
  listenerSendJson("listen_start");
  listenerFace("escuchando");
  Serial.println("[oido] escuchando");
  return true;
}

void Listener::stop(bool send) {
  flushOut();
  i2s_driver_uninstall(PORT);
  on_ = false;
  if (send) listenerSendJson("listen_end");
  else listenerFace("neutral");
  Serial.printf("[oido] fin (%s)\n", send ? "enviado" : "cancelado");
}

void Listener::cancel() {
  if (on_) {
    // el servidor ya recibió listen_start: lo cerramos igual (descarta lo corto)
    stop(true);
  }
}

void Listener::update() {
  if (!on_) return;
  static int32_t raw[256 * 2];
  static int16_t pcm[256];
  static int run = 0;
  size_t got = 0;
  uint32_t now = millis();
  // junta todo lo disponible sin esperar
  for (int guard = 0; guard < 8; guard++) {
    if (i2s_read(PORT, raw, sizeof(raw), &got, 0) != ESP_OK || got == 0) break;
    int frames = got / 8;
    double sum = 0;
    for (int i = 0; i < frames; i++) {
      // este micrófono entrega una deriva lenta enorme (+-5 millones): la sacamos antes de dar ganancia, si no satura
      float v = (float)(raw[2 * i] >> 8);
      float y = v - hpX + HP_R * hpY;
      hpX = v;
      hpY = y;
      int32_t s = constrain((int32_t)(y / GAIN_DIV), -32768, 32767);
      pcm[i] = (int16_t)s;
      sum += (double)s * s;
    }
    float rms = sqrt(sum / max(frames, 1));
    // el doble toque sacude el robot: ignoramos los primeros 350 ms, y de 350 a 800 ms medimos el ruido de fondo
    uint32_t el = now - t0_;
    if (el < 50) run = 0;
    if (el < 350) {
      // golpe del toque: no cuenta
    } else if (el < 800) {
      noise_ = max(noise_, rms);
      calibN_++;
    } else {
      float thr = min(max(350.0f, noise_ * 3.0f), 2500.0f);
      // la voz tiene que sostenerse unos 4 bloques seguidos (~60 ms): un golpe o un click no alcanza
      run = rms > thr ? run + 1 : 0;
      if (run >= 4) {
        heardVoice_ = true;
        lastVoice_ = now;
      }
    }
    queueOut((const uint8_t *)pcm, frames * 2);
  }
  if (now - t0_ > MAX_MS) return stop(true);
  if (!heardVoice_ && now - t0_ > NO_VOICE_MS) return stop(true);
  if (heardVoice_ && now - lastVoice_ > SILENCE_MS) return stop(true);
}
