#include "listener.h"

#include <driver/i2s.h>
#include <math.h>

#include "config.h"
#include "speaker.h"

static const i2s_port_t PORT = I2S_NUM_0;
static const int RATE = 16000;
static const uint32_t MAX_MS = 10000;      // tope de una frase
static const uint32_t NO_VOICE_MS = 4000;  // si nadie habla en 4 s, cancela
static const uint32_t SILENCE_MS = 1100;   // pausa que cierra la frase
static const int GAIN = 6;                 // el INMP441 entrega poco nivel

Listener listener;

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
  size_t got = 0;
  uint32_t now = millis();
  // junta todo lo disponible sin esperar
  for (int guard = 0; guard < 8; guard++) {
    if (i2s_read(PORT, raw, sizeof(raw), &got, 0) != ESP_OK || got == 0) break;
    int frames = got / 8;
    double sum = 0;
    for (int i = 0; i < frames; i++) {
      int32_t s = raw[2 * i] >> 14;  // 24 bits útiles -> 18 bits
      s = constrain(s * GAIN / 4, -32768, 32767);
      pcm[i] = (int16_t)s;
      sum += (double)s * s;
    }
    float rms = sqrt(sum / max(frames, 1));
    // los primeros 300 ms miden el ruido de fondo
    if (now - t0_ < 300) {
      noise_ = max(noise_, rms);
      calibN_++;
    } else {
      float thr = max(350.0f, noise_ * 3.0f);
      if (rms > thr) {
        heardVoice_ = true;
        lastVoice_ = now;
      }
    }
    listenerSendBin((const uint8_t *)pcm, frames * 2);
  }
  if (now - t0_ > MAX_MS) return stop(true);
  if (!heardVoice_ && now - t0_ > NO_VOICE_MS) return stop(true);
  if (heardVoice_ && now - lastVoice_ > SILENCE_MS) return stop(true);
}
