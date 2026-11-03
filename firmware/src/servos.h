#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

// Los 4 servos SG90: cuello (pan = girar, tilt = cabecear) y un brazo por hombro.
// Se mueven de a poco (vel = grados por segundo) y nunca salen de los límites calibrados.
// Un servo recién recibe señal cuando se le pide algo: así no "salta" al prender la placa.
class Servos {
 public:
  enum Id { PAN, TILT, ARM_L, ARM_R, N };
  struct Key {
    uint16_t t;    // ms desde que arranca el gesto
    int16_t p[N];  // desplazamiento desde el centro (999 = no tocar)
  };
  void begin();
  void setCalibration(JsonVariantConst servos);  // {pan:{centro,min,max,invertido,vel},...}
  void moveRaw(const char *name, int angle);      // calibración: lleva ESE servo a un ángulo físico, despacio
  void gesture(const char *name);                 // asentir, negar, saludar, bailar...
  void stop();                                    // corta la señal a todos (quedan sueltos)
  void update(uint32_t now);                      // llamar seguido en loop()

 private:
  struct Cal {
    int centro, min, max, vel;
    bool inv;
  };
  static int idOf(const char *name);
  void attach(int i);
  void write(int i, float angle);
  float offsetToAngle(int i, int off) const;
  void target(int i, float angle, bool clamp = true);

  Cal cal_[N];
  float pos_[N];
  float goal_[N];
  bool on_[N] = {false, false, false, false};
  uint32_t last_ = 0;
  const Key *keys_ = nullptr;
  int nKeys_ = 0, nextKey_ = 0;
  uint32_t gestureStart_ = 0;
  uint32_t idleSince_ = 0;
};
