#pragma once
#include <Arduino.h>

// Pantalla táctil (AXS5106L) + gestos: los mismos que el panel.
//   toque · tres toques rápidos · mantener apretado · deslizar en 4 direcciones

enum class Swipe { Izquierda, Derecha, Arriba, Abajo };

struct TouchHandler {
  virtual void onTap(int x, int y) = 0;
  virtual void onTripleTap() = 0;
  virtual void onLongPress() = 0;
  virtual void onSwipe(Swipe dir) = 0;
};

class Touch {
 public:
  bool begin();
  void poll(uint32_t now, TouchHandler &h);  // llamar seguido en loop()

 private:
  bool read(int &x, int &y);  // true si hay un dedo apoyado
  bool ok_ = false;
  bool down_ = false;
  bool longFired_ = false;
  bool moved_ = false;
  int x0_ = 0, y0_ = 0, x_ = 0, y_ = 0;
  uint32_t t0_ = 0;
  uint32_t lastRead_ = 0;
  int taps_ = 0;
  uint32_t lastTapAt_ = 0;
};
