#pragma once
#include <Arduino.h>

#include <vector>

// Reproductor de las caras "filmadas" del panel (data/caras.bin, lo genera
// robot-frontend/tools/caras/render.mjs). Cada clip es una cara o animación cuadro por cuadro;
// solo se guardan los pedazos de cada fila que cambian, así entra todo en la memoria de la placa.
class ClipPlayer {
 public:
  bool begin();  // lee el archivo que viene adentro del firmware
  bool ok() const { return !clips_.empty() && codes_; }
  int find(const String &key) const;  // "e/tierno/feliz", "a/terror/risa", "a/tierno/clima:lluvia"
  uint32_t durationMs(int idx) const;
  void start(int idx, uint32_t now);
  bool tick(uint32_t now);  // pasa al cuadro siguiente si ya toca; true si cambió
  bool ended() const { return ended_; }
  int current() const { return cur_; }
  int count() const { return clips_.size(); }
  String name(int i) const {
    char b[64];
    int n = clips_[i].nameLen < 63 ? clips_[i].nameLen : 63;
    memcpy(b, clips_[i].name, n);
    b[n] = 0;
    return String(b);
  }
  // pinta el cuadro actual en el lienzo con el color de ojos (dx: corre la cara a los costados)
  void blit(uint16_t *fb, uint16_t eye, int dx);

 private:
  struct Clip {
    const char *name;
    uint8_t nameLen;
    uint16_t ms, frames;
    bool loop;
    uint32_t off;
  };
  void decodeFrame();
  void buildLut(uint16_t eye);

  const uint8_t *bin_ = nullptr;
  size_t len_ = 0;
  const uint8_t *pal_ = nullptr;
  int palN_ = 0;
  std::vector<Clip> clips_;
  uint8_t *codes_ = nullptr;  // un byte por píxel: qué color va
  uint16_t lut_[256];
  uint16_t lutEye_ = 0xFFFF;
  bool lutOk_ = false;
  int cur_ = -1;
  uint16_t frame_ = 0;
  uint32_t p_ = 0;
  uint32_t next_ = 0;
  bool ended_ = false;
};
