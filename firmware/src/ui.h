#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <Arduino_GFX_Library.h>

#include <vector>

#include "face.h"
#include "touch.h"

// Lo que se ve en la pantalla además de la cara: menú (carrusel), vistazo, cronómetro y modo cocina.
// Los gestos son los mismos que en el panel:
//   deslizar a los costados: abre el menú / pasa de opción · deslizar arriba: cierra
//   deslizar abajo: vistazo (hora y conexión) · toque: elige / sigue · mantener: termina
//   tres toques: cosquillas
class UI : public TouchHandler {
 public:
  typedef void (*SendFn)(JsonDocument &);
  void begin(Arduino_GFX *g, Face *face, SendFn send);

  // Mensajes del servidor que le tocan a la interfaz: "cocina" y "recetas"
  void onServer(JsonDocument &msg);
  void setOnline(bool online) { online_ = online; }

  bool showing() const;          // true si en vez de la cara va una pantalla de la interfaz
  bool update(uint32_t now);     // dibuja si hace falta; true si redibujó
  String badge(uint32_t now);    // cuenta regresiva para mostrar arriba de la cara ("4:59")
  void setBrightness(int pct);

  // gestos
  void onTap(int x, int y) override;
  void onTripleTap() override;
  void onLongPress() override;
  void onSwipe(Swipe dir) override;

 private:
  struct Item {
    String id, label, extra;
    int min;
  };
  enum Screen { CARA, MENU, PEEK, CRONO };

  void openMenu(const String &level, int index = 0);
  void runItem(const Item &it);
  void showPeek(const String &a, const String &b = "", const String &c = "");
  void sendMenu(const char *accion, const char *key = nullptr, const String &value = "", int num = -1);
  void addTimer(int min);
  void cancelTimers();

  void drawMenu();
  void drawPeek();
  void drawCrono(uint32_t now);
  void drawCocina(uint32_t now);
  void textCenter(const String &s, int y, int size, uint16_t color);
  String clock(uint32_t secs, bool tenths = false, uint32_t ms = 0);

  Arduino_GFX *g_ = nullptr;
  Face *face_ = nullptr;
  SendFn send_ = nullptr;
  Screen screen_ = CARA;
  bool dirty_ = true;
  bool wasShowing_ = false;
  uint32_t lastDraw_ = 0;
  bool online_ = false;

  // menú
  String level_ = "main";
  std::vector<Item> items_;
  int index_ = 0;

  // vistazo
  String peek_[3];
  uint32_t peekUntil_ = 0;

  // cronómetro
  bool cronoRunning_ = false;
  uint32_t cronoSince_ = 0, cronoAcc_ = 0;

  // timers sueltos (el aviso lo da el servidor; acá solo la cuenta regresiva)
  std::vector<uint32_t> timers_;

  // cocina (la maneja el servidor)
  bool cocina_ = false;
  String cocinaId_, cocinaNombre_, cocinaTexto_;
  int cocinaPaso_ = -1, cocinaTotal_ = 0;
  uint32_t cocinaTimerFin_ = 0;

  int brillo_ = 100;
};
