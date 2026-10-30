#pragma once
#include <Arduino_GFX_Library.h>

#include "clips.h"

// Dibuja la cara de Robi en la pantalla (320x172 apaisada), con las mismas caras que el panel.
// Las coordenadas son las del panel (240x180 centradas): x de -40 a 280, y de 4 a 176.
class Face {
 public:
  void begin(Arduino_Canvas *canvas);
  void setEmotion(const String &emotion);
  void setColor(uint16_t color) { eye_ = color; dirty_ = true; }
  void setTerror(bool terror) { terror_ = terror; dirty_ = true; }
  void setTalking(bool talking) { talking_ = talking; }
  uint16_t color() const { return eye_; }
  void invalidate() { dirty_ = true; }
  // mira hacia un costado un rato (dx en píxeles: negativo = izquierda)
  void glance(int dx, uint32_t ms) { glanceDx_ = constrain(dx, -20, 20); glanceUntil_ = millis() + ms; dirty_ = true; }
  // cuenta regresiva chiquita arriba a la derecha ("" = nada)
  void setBadge(const String &b) { if (b != badge_) { badge_ = b; dirty_ = true; } }
  void showText(const String &text, uint32_t ms);  // cartelito abajo (estado, avisos)
  // Acciones especiales con animación propia: gol, bandera, risa, lagrima, apagon, tercerOjo, colmillos, clima
  void playAction(const String &name, const String &extra = "");
  // Llamar seguido en loop(): anima parpadeo, boca y vuelve a neutral solo. Devuelve true si redibujó.
  bool update(uint32_t now);
  const String &emotion() const { return emotion_; }

  static uint16_t parseColor(const char *hex);  // "#5ef2ff" -> RGB565

 private:
  void draw(uint32_t now);
  void drawVector(uint32_t now);  // caras dibujadas a mano (respaldo si no está caras.bin)
  String clipKey() const;
  int X(float x) const { return (int)(x + 40); }
  int Y(float y) const { return (int)(y - 4); }
  void eye(float cx, float w = 40, float h = 56, float dy = 0, float dx = 0);
  void lid(float cx, float inner, float outer, bool left);
  void thickQuad(float x0, float y0, float cx, float cy, float x1, float y1, float r, uint16_t c);
  void mouth(const char *kind);
  void heart(float cx, float cy);
  bool animated() const;
  void drawAction(uint32_t now);
  void terrorEyes();
  void fangs(float open);
  void cloud(float cx, float cy, uint16_t c);

  Arduino_GFX *g_ = nullptr;
  Arduino_Canvas *canvas_ = nullptr;
  ClipPlayer clips_;
  bool useClips_ = false;
  String clipKey_;
  uint32_t nextIdle_ = 0;
  void idleLife(uint32_t now);
  String emotion_ = "neutral";
  uint16_t eye_ = 0x5F1F;
  bool terror_ = false;
  bool talking_ = false;
  bool dirty_ = true;
  bool blinking_ = false;
  uint32_t nextBlink_ = 0;
  uint32_t blinkEnd_ = 0;
  uint32_t emotionAt_ = 0;
  uint32_t lastFrame_ = 0;
  String action_, actionExtra_;
  uint32_t actionStart_ = 0;
  uint32_t actionUntil_ = 0;
  int glanceDx_ = 0;
  uint32_t glanceUntil_ = 0;
  String badge_;
  String text_;
  uint32_t textUntil_ = 0;
};
