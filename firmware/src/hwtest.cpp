#include "hwtest.h"

#include <Wire.h>
#include <driver/i2s.h>
#include <math.h>

#include "config.h"

static const i2s_port_t PORT = I2S_NUM_0;
static const int RATE = 16000;

// Mic y parlante comparten BCLK/WS; mic entra por GPIO7 y el parlante sale por GPIO8.
static bool i2sStart(bool rx) {
  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX | (rx ? I2S_MODE_RX : 0));
  cfg.sample_rate = RATE;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT;  // estéreo: el INMP441 (L/R a GND) habla en el canal izquierdo
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  cfg.dma_buf_count = 6;
  cfg.dma_buf_len = 256;
  cfg.use_apll = false;
  cfg.tx_desc_auto_clear = true;
  if (i2s_driver_install(PORT, &cfg, 0, nullptr) != ESP_OK) return false;
  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = PIN_I2S_BCLK;
  pins.ws_io_num = PIN_I2S_WS;
  pins.data_out_num = PIN_I2S_AMP_DOUT;
  pins.data_in_num = rx ? PIN_I2S_MIC_DIN : I2S_PIN_NO_CHANGE;
  if (i2s_set_pin(PORT, &pins) != ESP_OK) {
    i2s_driver_uninstall(PORT);
    return false;
  }
  return true;
}

static void i2sStop() {
  i2s_zero_dma_buffer(PORT);
  i2s_driver_uninstall(PORT);
  // suelta los pines para que no queden tirando de la línea
  pinMode(PIN_I2S_AMP_DOUT, INPUT);
}

String HwTest::audio() {
  if (!i2sStart(false)) return "Parlante: no arranco el I2S";
  // tonos de 440 y 880 Hz, 4 s cada uno, a ~25 % del maximo
  const int amp = 1 << 29;
  const float freqs[2] = {440.0f, 880.0f};
  int32_t buf[256 * 2];
  float phase = 0;
  size_t total = 0;
  esp_err_t err = ESP_OK;
  for (int f = 0; f < 2; f++) {
    int blocks = RATE * 4 / 256;  // 4 s cada tono (para poder medir con el tester)
    for (int b = 0; b < blocks; b++) {
      for (int i = 0; i < 256; i++) {
        int32_t v = (int32_t)(sinf(phase) * amp);
        phase += 2 * PI * freqs[f] / RATE;
        if (phase > 2 * PI) phase -= 2 * PI;
        buf[2 * i] = v;
        buf[2 * i + 1] = v;
      }
      size_t w = 0;
      esp_err_t e = i2s_write(PORT, buf, sizeof(buf), &w, 1000);
      if (e != ESP_OK) err = e;
      total += w;
    }
  }
  memset(buf, 0, sizeof(buf));
  for (int b = 0; b < 8; b++) {
    size_t w;
    i2s_write(PORT, buf, sizeof(buf), &w, 1000);
  }
  i2sStop();
  Serial.printf("[audio] escritos %u bytes, err=%d\n", (unsigned)total, (int)err);
  return "Parlante: " + String((unsigned)total) + " bytes enviados, error=" + String((int)err) + " (0 = ok). Se oyo?";
}

String HwTest::micro() {
  if (!i2sStart(true)) return "Mic: no arranco el I2S";
  int32_t buf[256 * 2];
  // por canal: media (DC), desvío (la parte que cambia = el sonido), mínimo y máximo, en 24 bits
  double sum[2] = {0, 0}, sq[2] = {0, 0};
  int32_t mn[2] = {INT32_MAX, INT32_MAX}, mx[2] = {INT32_MIN, INT32_MIN};
  uint32_t sample[2] = {0, 0};
  uint32_t first[6] = {0};
  int nFirst = 0;
  long n = 0, lowZero = 0;
  double hpSq = 0, hpX = 0, hpY = 0;
  uint32_t t0 = millis();
  size_t got;
  while (millis() - t0 < 2000) {
    if (i2s_read(PORT, buf, sizeof(buf), &got, 500) != ESP_OK) continue;
    int frames = got / 8;
    for (int i = 0; i < frames; i++) {
      if (millis() - t0 < 300) continue;  // descarta el arranque
      if (nFirst < 6) first[nFirst++] = (uint32_t)buf[2 * i];
      if ((buf[2 * i] & 0xFF) == 0) lowZero++;
      {
        double v0 = (double)(buf[2 * i] >> 8);
        double y0 = v0 - hpX + 0.96 * hpY;
        hpX = v0;
        hpY = y0;
        hpSq += y0 * y0;
      }
      for (int c = 0; c < 2; c++) {
        int32_t v = buf[2 * i + c] >> 8;  // INMP441: 24 bits en palabra de 32
        sum[c] += v;
        sq[c] += (double)v * v;
        if (v < mn[c]) mn[c] = v;
        if (v > mx[c]) mx[c] = v;
        sample[c] = (uint32_t)buf[2 * i + c];
      }
      n++;
    }
  }
  i2sStop();
  if (!n) return "Mic: no llegaron datos";
  String out = "Mic";
  const char *name[2] = {"izq", "der"};
  float ac[2];
  for (int c = 0; c < 2; c++) {
    double mean = sum[c] / n;
    ac[c] = sqrt(max(0.0, sq[c] / n - mean * mean));
    Serial.printf("[mic] %s dc=%.0f ac=%.0f min=%d max=%d raw=0x%08X\n", name[c], mean, ac[c], (int)mn[c], (int)mx[c], (unsigned)sample[c]);
    out += String(" | ") + name[c] + ": dc " + String((long)mean) + " ac " + String((long)ac[c]) + " min " + String((long)mn[c]) + " max " + String((long)mx[c]);
  }
  out += " | filtrado " + String((long)sqrt(hpSq / n)) + " | bajo0 " + String((int)(100 * lowZero / n)) + "% | crudo";
  for (int i = 0; i < nFirst; i++) out += " " + String(first[i], HEX);
  if (ac[0] < 1 && ac[1] < 1) out += " -> todo quieto (revisar SD->GPIO7, VDD y GND)";
  return out;
}

static bool i2cHas(uint8_t addr) {
  Wire.beginTransmission(addr);
  return Wire.endTransmission() == 0;
}

String HwTest::sensores() {
  // touch: cada TTP223 da HIGH al tocarlo. Mira ~6 s y anota cuáles se tocaron.
  const int pins[3] = {PIN_TOUCH_CABEZA, PIN_TOUCH_PANZA, PIN_TOUCH_ESPALDA};
  const char *names[3] = {"cabeza", "panza", "espalda"};
  for (int p : pins) pinMode(p, INPUT);
  bool seen[3] = {false, false, false};
  bool stuck[3] = {false, false, false};
  for (int i = 0; i < 3; i++) stuck[i] = digitalRead(pins[i]) == HIGH;  // ya en HIGH sin tocar
  uint32_t t0 = millis();
  while (millis() - t0 < 6000) {
    for (int i = 0; i < 3; i++)
      if (digitalRead(pins[i]) == HIGH) seen[i] = true;
    delay(5);
  }
  String out = "Touch:";
  for (int i = 0; i < 3; i++) {
    out += String(" ") + names[i] + (seen[i] ? (stuck[i] ? "=siempre ON" : "=OK") : "=no");
  }
  // todo lo que contesta en el I2C (la pantalla táctil es 0x63, el MPU 0x68)
  out += " | I2C:";
  int found = 0;
  for (uint8_t a = 1; a < 127; a++)
    if (i2cHas(a)) {
      out += " 0x" + String(a, HEX);
      found++;
    }
  if (!found) out += " nada (bus colgado: revisar SDA42/SCL41)";
  // MPU6050 (0x68 o 0x69) en el I2C de la placa
  uint8_t addr = i2cHas(0x68) ? 0x68 : (i2cHas(0x69) ? 0x69 : 0);
  if (!addr) {
    out += " | MPU: no responde (SDA42/SCL41, 3V3)";
    return out;
  }
  Wire.beginTransmission(addr);
  Wire.write(0x75);  // WHO_AM_I
  Wire.endTransmission(false);
  Wire.requestFrom(addr, (uint8_t)1);
  int who = Wire.available() ? Wire.read() : -1;
  // sacarlo del sueño y leer aceleración
  Wire.beginTransmission(addr);
  Wire.write(0x6B);
  Wire.write(0);
  Wire.endTransmission();
  delay(50);
  Wire.beginTransmission(addr);
  Wire.write(0x3B);
  Wire.endTransmission(false);
  Wire.requestFrom(addr, (uint8_t)6);
  int16_t ax = 0, ay = 0, az = 0;
  if (Wire.available() >= 6) {
    ax = (Wire.read() << 8) | Wire.read();
    ay = (Wire.read() << 8) | Wire.read();
    az = (Wire.read() << 8) | Wire.read();
  }
  out += String(" | MPU 0x") + String(addr, HEX) + " id=0x" + String(who, HEX) + " g=" + String(ax / 16384.0f, 1) + "," + String(ay / 16384.0f, 1) + "," + String(az / 16384.0f, 1);
  return out;
}
