#include "servos.h"

#include "config.h"

static const int PINS[Servos::N] = {PIN_SERVO_PAN, PIN_SERVO_TILT, PIN_SERVO_ARM_L, PIN_SERVO_ARM_R};
static const int CH0 = 2;  // canales PWM 2..5 (el 0 es la luz de la pantalla)
static const int FREQ = 50, BITS = 14;
static const int US_MIN = 500, US_MAX = 2400;  // pulso de un SG90 para 0° y 180°
static const int16_t X = 999;                  // "no tocar" en una coreografía

// ---- coreografías (desplazamientos en grados desde el centro; brazos: + = arriba)
//                    t      pan  tilt armL armR
static const Servos::Key ASENTIR[] = {{0, {X, 14, X, X}}, {250, {X, -8, X, X}}, {500, {X, 14, X, X}}, {750, {X, -8, X, X}}, {1000, {X, 0, X, X}}};
static const Servos::Key NEGAR[] = {{0, {30, X, X, X}}, {300, {-30, X, X, X}}, {600, {30, X, X, X}}, {900, {-30, X, X, X}}, {1200, {0, X, X, X}}};
static const Servos::Key ARRIBA[] = {{0, {X, 20, X, X}}, {1200, {X, 0, X, X}}};
static const Servos::Key ABAJO[] = {{0, {X, -20, X, X}}, {1200, {X, 0, X, X}}};
static const Servos::Key IZQ[] = {{0, {40, X, X, X}}, {1200, {0, X, X, X}}};
static const Servos::Key DER[] = {{0, {-40, X, X, X}}, {1200, {0, X, X, X}}};
static const Servos::Key LADEAR[] = {{0, {15, 12, X, X}}, {1200, {0, 0, X, X}}};
static const Servos::Key SALUDAR[] = {{0, {-10, 5, X, 130}}, {450, {X, X, X, 100}}, {750, {X, X, X, 140}}, {1050, {X, X, X, 100}}, {1350, {X, X, X, 140}},
                                      {1750, {0, 0, X, 0}}};
static const Servos::Key FESTEJAR[] = {{0, {X, 15, 150, 150}}, {500, {X, X, 120, 120}}, {800, {X, X, 150, 150}}, {1100, {X, X, 120, 120}},
                                       {1400, {X, X, 150, 150}}, {2000, {X, 0, 0, 0}}};
static const Servos::Key APLAUDIR[] = {{0, {X, X, 80, 80}}, {300, {X, X, 60, 60}}, {550, {X, X, 80, 80}}, {800, {X, X, 60, 60}}, {1050, {X, X, 80, 80}},
                                       {1300, {X, X, 60, 60}}, {1600, {X, X, 0, 0}}};
static const Servos::Key HOMBROS[] = {{0, {X, -6, 35, 35}}, {900, {X, 0, 0, 0}}};
static const Servos::Key TAPARSE[] = {{0, {X, -15, 165, 165}}, {1800, {X, 0, 0, 0}}};
static const Servos::Key ABRAZO[] = {{0, {X, 5, 90, 90}}, {1600, {X, 0, 0, 0}}};
static const Servos::Key BAILAR[] = {{0, {20, X, 120, 0}}, {400, {-20, X, 0, 120}}, {800, {20, X, 120, 0}}, {1200, {-20, X, 0, 120}},
                                     {1600, {20, X, 120, 0}}, {2000, {-20, X, 0, 120}}, {2400, {20, X, 120, 0}}, {2800, {0, X, 0, 0}}};
static const Servos::Key SENALAR[] = {{0, {-20, 5, X, 90}}, {1300, {0, 0, X, 0}}};

#define G(n, a) {n, a, (int)(sizeof(a) / sizeof(a[0]))}
static const struct {
  const char *name;
  const Servos::Key *keys;
  int n;
} GESTURES[] = {G("asentir", ASENTIR), G("negar", NEGAR),       G("mirarArriba", ARRIBA), G("mirarAbajo", ABAJO), G("mirarIzquierda", IZQ),
                G("mirarDerecha", DER),  G("ladear", LADEAR),    G("saludar", SALUDAR),    G("festejar", FESTEJAR), G("aplaudir", APLAUDIR),
                G("hombros", HOMBROS),  G("taparse", TAPARSE),  G("abrazo", ABRAZO),      G("bailar", BAILAR),     G("senalar", SENALAR)};

void Servos::begin() {
  // calibración por defecto (la misma que el servidor) hasta que llegue la guardada
  cal_[PAN] = {90, 30, 150, 120, false};
  cal_[TILT] = {90, 65, 115, 90, false};
  cal_[ARM_L] = {20, 0, 170, 180, false};
  cal_[ARM_R] = {20, 0, 170, 180, true};
  for (int i = 0; i < N; i++) {
    pos_[i] = goal_[i] = cal_[i].centro;
    speed_[i] = cal_[i].vel;
  }
}

int Servos::idOf(const char *name) {
  if (!strcmp(name, "pan")) return PAN;
  if (!strcmp(name, "tilt")) return TILT;
  if (!strcmp(name, "armL")) return ARM_L;
  if (!strcmp(name, "armR")) return ARM_R;
  return -1;
}

void Servos::setCalibration(JsonVariantConst s) {
  const char *names[N] = {"pan", "tilt", "armL", "armR"};
  for (int i = 0; i < N; i++) {
    JsonVariantConst c = s[names[i]];
    if (c.isNull()) continue;
    cal_[i].centro = c["centro"] | cal_[i].centro;
    cal_[i].min = c["min"] | cal_[i].min;
    cal_[i].max = c["max"] | cal_[i].max;
    cal_[i].vel = constrain((int)(c["vel"] | cal_[i].vel), 10, 360);
    cal_[i].inv = c["invertido"] | cal_[i].inv;
    if (!on_[i]) pos_[i] = goal_[i] = cal_[i].centro;
  }
  Serial.println("[servos] calibracion recibida");
}

void Servos::attach(int i) {
  if (on_[i]) return;
  ledcSetup(CH0 + i, FREQ, BITS);
  ledcAttachPin(PINS[i], CH0 + i);
  on_[i] = true;
  write(i, pos_[i]);  // arranca donde cree que está (el centro), sin saltos raros
}

void Servos::write(int i, float angle) {
  int us = US_MIN + (int)((US_MAX - US_MIN) * constrain(angle, 0.0f, 180.0f) / 180.0f);
  ledcWrite(CH0 + i, (uint32_t)us * ((1 << BITS) - 1) / 20000);
}

float Servos::offsetToAngle(int i, int off) const { return cal_[i].centro + (cal_[i].inv ? -off : off); }

void Servos::target(int i, float angle, bool clamp, float speed) {
  if (clamp) angle = constrain(angle, (float)cal_[i].min, (float)cal_[i].max);
  else angle = constrain(angle, 0.0f, 180.0f);
  attach(i);
  goal_[i] = angle;
  speed_[i] = speed > 0 ? speed : cal_[i].vel;
}

void Servos::moveRaw(const char *name, int angle) {
  int i = idOf(name);
  if (i < 0) return;
  keys_ = nullptr;  // calibración: corta cualquier gesto
  target(i, angle, false);
  Serial.printf("[servos] %s -> %d\n", name, angle);
}

void Servos::gesture(const char *name) {
  for (auto &g : GESTURES)
    if (!strcmp(g.name, name)) {
      keys_ = g.keys;
      nKeys_ = g.n;
      nextKey_ = 0;
      gestureStart_ = millis();
      return;
    }
}

void Servos::stop() {
  keys_ = nullptr;
  for (int i = 0; i < N; i++) {
    if (!on_[i]) continue;
    ledcWrite(CH0 + i, 0);
    ledcDetachPin(PINS[i]);
    on_[i] = false;
    goal_[i] = pos_[i];
  }
  Serial.println("[servos] STOP");
}

void Servos::update(uint32_t now) {
  // coreografía: aplica los cuadros que ya tocan
  while (keys_ && nextKey_ < nKeys_ && (int32_t)(now - gestureStart_) >= (int32_t)keys_[nextKey_].t) {
    const Key &k = keys_[nextKey_];
    // tiempo hasta el próximo cuadro: tiene que llegar antes (un 85%), sin pasar el máximo del SG90
    float dt = (nextKey_ + 1 < nKeys_ ? keys_[nextKey_ + 1].t - k.t : 500) / 1000.0f;
    for (int i = 0; i < N; i++) {
      if (k.p[i] == X) continue;
      float a = constrain(offsetToAngle(i, k.p[i]), (float)cal_[i].min, (float)cal_[i].max);
      float need = fabsf(a - pos_[i]) / (dt * 0.85f);
      target(i, a, true, constrain(need, (float)cal_[i].vel, 450.0f));
    }
    if (++nextKey_ >= nKeys_) keys_ = nullptr;
  }
  // avanza cada servo hacia su meta a su velocidad
  float dt = last_ ? (now - last_) / 1000.0f : 0;
  last_ = now;
  if (dt <= 0 || dt > 0.2f) return;
  bool moving = false;
  for (int i = 0; i < N; i++) {
    if (!on_[i]) continue;
    float d = goal_[i] - pos_[i];
    if (fabsf(d) < 0.5f) continue;
    float step = speed_[i] * dt;
    pos_[i] += d > 0 ? min(step, d) : max(-step, d);
    write(i, pos_[i]);
    moving = true;
  }
  // los brazos, quietos 2 s, se sueltan (no tiemblan ni gastan batería). El cuello queda SIEMPRE firme:
  // en Robi v2 el eje del SÍ queda atrás del centro de la cabeza y, suelto, la cara se caería para adelante.
  if (moving || keys_) idleSince_ = now;
  else if (now - idleSince_ > 2000)
    for (int i : {ARM_L, ARM_R})
      if (on_[i]) {
        ledcWrite(CH0 + i, 0);
        ledcDetachPin(PINS[i]);
        on_[i] = false;
      }
}
