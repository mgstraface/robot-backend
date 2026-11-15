#pragma once
#include <Arduino.h>

// Oído del robot: graba con el INMP441 (16 kHz, 16 bits, mono), manda el audio al servidor mientras habla
// la persona y corta solo cuando se hace silencio.
class Listener {
 public:
  bool start();       // false si ya está escuchando o hablando
  void update();      // llamar en cada vuelta de loop()
  bool listening() const { return on_; }
  void cancel();

 private:
  void stop(bool send);
  bool on_ = false;
  uint32_t t0_ = 0, lastVoice_ = 0;
  bool heardVoice_ = false;
  float noise_ = 0;
  int calibN_ = 0;
};

extern Listener listener;
// los define main.cpp
void listenerSendBin(const uint8_t *data, size_t len);
void listenerSendJson(const char *type);
void listenerFace(const char *emotion);
