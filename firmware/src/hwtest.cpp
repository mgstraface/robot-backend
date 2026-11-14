#include "hwtest.h"

#include <Wire.h>
#include <driver/i2s.h>
#include <math.h>

#include "config.h"

static const i2s_port_t PORT = I2S_NUM_0;
static const int RATE = 16000;

// Mic y parlante comparten BCLK/WS; mic entra por GPIO7 y el parlante sale por GPIO8.
static bool i2sStart() {
  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX | I2S_MODE_RX);
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
  pins.data_in_num = PIN_I2S_MIC_DIN;
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
  if (!i2sStart()) return "Parlante: no arranco el I2S";
  // pitidos suaves: 440 Hz y 880 Hz (amplitud baja, no asusta ni satura)
  const int amp = 1 << 27;  // ~6 % del máximo
  const float freqs[2] = {440.0f, 880.0f};
  int32_t buf[256 * 2];
  float phase = 0;
  for (int f = 0; f < 2; f++) {
    int blocks = RATE * 3 / 10 / 256;  // 0,3 s cada tono
    for (int b = 0; b < blocks; b++) {
      for (int i = 0; i < 256; i++) {
        int32_t v = (int32_t)(sinf(phase) * amp);
        phase += 2 * PI * freqs[f] / RATE;
        if (phase > 2 * PI) phase -= 2 * PI;
        buf[2 * i] = v;
        buf[2 * i + 1] = v;
      }
      size_t w;
      i2s_write(PORT, buf, sizeof(buf), &w, 1000);
    }
  }
  // silencio para vaciar el buffer
  memset(buf, 0, sizeof(buf));
  for (int b = 0; b < 8; b++) {
    size_t w;
    i2s_write(PORT, buf, sizeof(buf), &w, 1000);
  }
  i2sStop();
  return "Parlante: pitido enviado, se oyo?";
}

String HwTest::micro() {
  if (!i2sStart()) return "Mic: no arranco el I2S";
  int32_t buf[256 * 2];
  double sum = 0, sumL = 0, sumR = 0;
  long n = 0;
  int32_t peak = 0;
  uint32_t t0 = millis();
  size_t got;
  while (millis() - t0 < 2000) {
    if (i2s_read(PORT, buf, sizeof(buf), &got, 500) != ESP_OK) continue;
    int frames = got / 8;
    for (int i = 0; i < frames; i++) {
      int32_t l = buf[2 * i] >> 8;      // INMP441: 24 bits en palabra de 32
      int32_t r = buf[2 * i + 1] >> 8;
      if (millis() - t0 < 300) continue;  // descarta el arranque
      sumL += (double)l * l;
      sumR += (double)r * r;
      sum += (double)l * l;
      if (abs(l) > peak) peak = abs(l);
      n++;
    }
  }
  i2sStop();
  if (!n) return "Mic: no llegaron datos";
  float rmsL = sqrt(sumL / n), rmsR = sqrt(sumR / n);
  Serial.printf("[mic] rmsL=%.0f rmsR=%.0f pico=%d\n", rmsL, rmsR, (int)peak);
  if (rmsL < 1 && rmsR < 1) return "Mic: todo en 0 (revisar SD->GPIO7, VDD y GND)";
  String lado = rmsL >= rmsR ? "izq" : "der";
  return "Mic OK (" + lado + ") nivel " + String((int)max(rmsL, rmsR)) + " pico " + String((int)peak);
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
