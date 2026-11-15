#include "speaker.h"

#include <driver/i2s.h>
#include <esp_heap_caps.h>

#include "config.h"

static const i2s_port_t PORT = I2S_NUM_0;
static const size_t MAX_BYTES = 2 * 1024 * 1024;  // ~43 s a 24 kHz (cabe de sobra en los 8 MB de PSRAM)
static const float VOLUME = 0.6f;                 // el MAX98357A con 5 V es fuerte: arrancamos bajito

Speaker speaker;

void Speaker::release() {
  if (buf_) heap_caps_free(buf_);
  buf_ = nullptr;
  cap_ = got_ = pos_ = 0;
  outLen_ = outPos_ = 0;
}

void Speaker::onStart(uint32_t bytes, uint32_t sampleRate, bool pcm) {
  if (playing_) return;  // ya está hablando: ignora lo nuevo
  release();
  receiving_ = false;
  ignoring_ = !pcm || bytes == 0 || bytes > MAX_BYTES;
  if (ignoring_) {
    Serial.printf("[voz] audio ignorado (pcm=%d, bytes=%u)\n", (int)pcm, (unsigned)bytes);
    return;
  }
  buf_ = (int16_t *)heap_caps_malloc(bytes, MALLOC_CAP_SPIRAM);
  if (!buf_) {
    Serial.println("[voz] sin memoria para el audio");
    ignoring_ = true;
    return;
  }
  cap_ = bytes;
  rate_ = sampleRate ? sampleRate : 24000;
  receiving_ = true;
}

void Speaker::onData(const uint8_t *data, size_t len) {
  if (!receiving_ || ignoring_) return;
  if (got_ + len > cap_) len = cap_ - got_;
  memcpy((uint8_t *)buf_ + got_, data, len);
  got_ += len;
}

void Speaker::abort() {
  receiving_ = false;
  if (!playing_) release();
}

void Speaker::onEnd() {
  bool was = receiving_;
  receiving_ = false;
  if (!was || ignoring_ || got_ < 2) {
    ignoring_ = false;
    if (!playing_) release();
    return;
  }
  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX);
  cfg.sample_rate = rate_;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT;
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  cfg.dma_buf_count = 16;
  cfg.dma_buf_len = 512;  // ~0,34 s de colchón: aguanta que la pantalla tarde en dibujar
  cfg.use_apll = false;
  cfg.tx_desc_auto_clear = true;
  if (i2s_driver_install(PORT, &cfg, 0, nullptr) != ESP_OK) {
    Serial.println("[voz] no arranco el I2S");
    release();
    return;
  }
  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = PIN_I2S_BCLK;
  pins.ws_io_num = PIN_I2S_WS;
  pins.data_out_num = PIN_I2S_AMP_DOUT;
  pins.data_in_num = I2S_PIN_NO_CHANGE;
  if (i2s_set_pin(PORT, &pins) != ESP_OK) {
    i2s_driver_uninstall(PORT);
    release();
    return;
  }
  pos_ = 0;
  outLen_ = outPos_ = 0;
  playing_ = true;
  speakerTalking(true);
  Serial.printf("[voz] reproduciendo %u muestras a %u Hz\n", (unsigned)(got_ / 2), (unsigned)rate_);
}

void Speaker::finish() {
  i2s_zero_dma_buffer(PORT);
  i2s_driver_uninstall(PORT);
  pinMode(PIN_I2S_AMP_DOUT, INPUT);
  playing_ = false;
  release();
  speakerTalking(false);
  Serial.println("[voz] listo");
}

void Speaker::update() {
  if (!playing_) return;
  const size_t total = got_ / 2;
  // llena el colchón del I2S hasta donde entre sin esperar
  for (int guard = 0; guard < 16; guard++) {
    if (outPos_ >= outLen_) {
      if (pos_ >= total) {
        // todo enviado: espera a que se vacíe el colchón (~0,4 s) antes de cerrar
        static uint32_t doneAt = 0;
        if (!doneAt) doneAt = millis();
        if (millis() - doneAt > 450) {
          doneAt = 0;
          finish();
        }
        return;
      }
      size_t n = min((size_t)256, total - pos_);
      for (size_t i = 0; i < n; i++) {
        int16_t v = (int16_t)(buf_[pos_ + i] * VOLUME);
        out_[2 * i] = v;
        out_[2 * i + 1] = v;
      }
      pos_ += n;
      outLen_ = n * 2;  // muestras int16 (estéreo)
      outPos_ = 0;
    }
    size_t w = 0;
    i2s_write(PORT, out_ + outPos_, (outLen_ - outPos_) * 2, &w, 0);
    outPos_ += w / 2;
    if (outPos_ < outLen_) return;  // el colchón está lleno: seguimos la próxima vuelta
  }
}
