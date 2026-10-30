#include "touch.h"

#include <Wire.h>

#include "config.h"

// Protocolo del AXS5106L (del driver de Waveshare para esta placa):
//   registro 0x01: 14 bytes — [1] = cantidad de dedos, [2..5] = X e Y (12 bits cada una)
//   registro 0x08: id del chip (solo para ver si responde)
// Las coordenadas vienen en vertical (172x320); la cara va apaisada, así que se cruzan los ejes.
static const uint8_t ADDR = 0x63;
static const uint32_t LONG_MS = 650;
static const uint32_t MULTI_MS = 380;
static const int SWIPE_PX = 40;
static const int MOVE_PX = 15;

static volatile bool dataReady = false;
static void IRAM_ATTR onTouchIrq() { dataReady = true; }

bool Touch::begin() {
  // reset largo: con pulsos más cortos el chip no siempre responde
  pinMode(PIN_TP_RST, OUTPUT);
  digitalWrite(PIN_TP_RST, LOW);
  delay(200);
  digitalWrite(PIN_TP_RST, HIGH);
  delay(300);

  Wire.beginTransmission(ADDR);
  Wire.write(0x08);
  ok_ = Wire.endTransmission() == 0 && Wire.requestFrom(ADDR, (uint8_t)3) == 3;
  if (ok_) {
    uint8_t id[3];
    Wire.readBytes(id, 3);
    Serial.printf("[tactil] AXS5106L listo (id %02X %02X %02X)\n", id[0], id[1], id[2]);
  } else {
    Serial.println("[tactil] no responde");
  }
  pinMode(PIN_TP_INT, INPUT_PULLUP);
  attachInterrupt(PIN_TP_INT, onTouchIrq, FALLING);
  return ok_;
}

bool Touch::read(int &x, int &y) {
  Wire.beginTransmission(ADDR);
  Wire.write(0x01);
  if (Wire.endTransmission() != 0) return false;
  uint8_t d[14] = {0};
  if (Wire.requestFrom(ADDR, (uint8_t)sizeof(d)) != sizeof(d)) return false;
  Wire.readBytes(d, sizeof(d));
  if (d[1] == 0 || d[1] > 5) return false;
  int rawX = ((d[2] & 0x0F) << 8) | d[3];  // 0..171
  int rawY = ((d[4] & 0x0F) << 8) | d[5];  // 0..319
  x = rawY;  // apaisada: se cruzan los ejes
  y = rawX;
  return true;
}

void Touch::poll(uint32_t now, TouchHandler &h) {
  if (!ok_) return;
  // con un dedo apoyado se lee seguido (para ver el movimiento y cuándo se levanta)
  if (!dataReady && !down_) return;
  if (now - lastRead_ < 12) return;
  lastRead_ = now;
  dataReady = false;

  int x, y;
  bool pressed = read(x, y);

  if (pressed && !down_) {  // apoyó el dedo
    down_ = true;
    longFired_ = false;
    moved_ = false;
    x0_ = x_ = x;
    y0_ = y_ = y;
    t0_ = now;
    return;
  }
  if (pressed && down_) {  // dedo apoyado
    x_ = x;
    y_ = y;
    if (abs(x_ - x0_) > MOVE_PX || abs(y_ - y0_) > MOVE_PX) moved_ = true;  // desliza: no es "mantener"
    if (!moved_ && !longFired_ && now - t0_ >= LONG_MS) {
      longFired_ = true;
      h.onLongPress();
    }
    return;
  }
  if (!pressed && down_) {  // levantó el dedo
    down_ = false;
    if (longFired_) return;
    int dx = x_ - x0_, dy = y_ - y0_;
    if (max(abs(dx), abs(dy)) >= SWIPE_PX) {
      if (abs(dx) > abs(dy)) h.onSwipe(dx > 0 ? Swipe::Derecha : Swipe::Izquierda);
      else h.onSwipe(dy > 0 ? Swipe::Abajo : Swipe::Arriba);
      return;
    }
    // toque: el primero responde al instante; si llegan 3 seguidos, además son "cosquillas"
    if (now - lastTapAt_ > MULTI_MS) taps_ = 0;
    taps_++;
    lastTapAt_ = now;
    if (taps_ == 1) h.onTap(x_, y_);
    if (taps_ >= 3) {
      taps_ = 0;
      h.onTripleTap();
    }
  }
}
