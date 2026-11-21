#pragma once
#include <Arduino.h>

// Voz del robot: el servidor manda audio_start + trozos binarios (PCM 16 bits mono) + audio_end.
// Se junta todo en la PSRAM y recién ahí se reproduce por el MAX98357A (así el WiFi no corta la voz).
class Speaker {
 public:
  void onStart(uint32_t bytes, uint32_t sampleRate, bool pcm, bool adpcm = false, uint32_t samples = 0);
  void onData(const uint8_t *data, size_t len);
  void onEnd();     // llegó todo: empieza a sonar
  void abort();     // se cortó la conexión a mitad de camino
  void update();    // llamar en cada vuelta de loop(): va llenando el buffer del I2S
  void setVolume(int percent);  // 0-100
  bool busy() const { return receiving_ || playing_; }
  bool playing() const { return playing_; }

 private:
  void release();
  void finish();
  int16_t *buf_ = nullptr;
  size_t cap_ = 0;       // bytes reservados
  size_t got_ = 0;       // bytes recibidos
  size_t pos_ = 0;       // muestras ya enviadas al I2S
  uint32_t rate_ = 24000;
  float gain_ = 0.6f;
  bool receiving_ = false;
  bool playing_ = false;
  bool adpcm_ = false;
  size_t samples_ = 0;     // total de muestras (ADPCM)
  int pred_ = 0, idx_ = 0; // estado del decodificador ADPCM
  bool ignoring_ = false;  // formato que no sabemos reproducir (ej. MP3)
  int16_t out_[512];       // estéreo pendiente de enviar
  size_t outLen_ = 0, outPos_ = 0;
};

extern Speaker speaker;
// main.cpp lo define: boca del robot mientras habla
void speakerTalking(bool on);
