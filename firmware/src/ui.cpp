#include "ui.h"

#include <Preferences.h>
#include <WiFi.h>
#include <time.h>

#include "config.h"
#include "text.h"

static const uint16_t C_BG = 0x0000;
static const uint16_t C_TEXT = 0xFFFF;
static const uint16_t C_HINT = 0x9CD3;
static const uint16_t C_DIM = 0x4208;
static const uint16_t C_ORANGE = 0xF52A;

static Preferences prefs;

// ---------- menú (los mismos ítems que el panel, menos los que todavía no existen en la placa)

void UI::begin(Arduino_GFX *g, Face *face, SendFn send) {
  g_ = g;
  face_ = face;
  send_ = send;
  // luz de fondo con PWM, para poder bajar el brillo
  ledcSetup(0, 5000, 8);
  ledcAttachPin(PIN_LCD_BL, 0);
  prefs.begin("robi", false);
  setBrightness(prefs.getInt("brillo", 100));
}

void UI::setBrightness(int pct) {
  brillo_ = constrain(pct, 10, 100);
  ledcWrite(0, map(brillo_, 0, 100, 0, 255));
  prefs.putInt("brillo", brillo_);
}

void UI::openMenu(const String &level, int index) {
  level_ = level;
  items_.clear();
  if (level == "main") {
    items_ = {{"cocina", "Cocina", "", 0},          {"temporizador", "Temporizador", "", 0}, {"pomodoro", "Pomodoro 25 min", "", 25},
              {"clima", "Clima", "", 0},            {"chiste", "Contame un chiste", "", 0},  {"modo", "Tierno / Terror", "", 0},
              {"brillo", "Brillo: " + String(brillo_) + "%", "", 0}, {"juegos", "Juegos", "", 0}};
  } else if (level == "temporizador") {
    int mins[] = {1, 3, 5, 10, 15, 30};
    for (int m : mins) items_.push_back({"timer", String(m) + (m == 1 ? " minuto" : " minutos"), "", m});
    items_.push_back({"cronometro", "Cronometro", "", 0});
    items_.push_back({"volver", "Volver", "", 0});
  } else if (level == "recetas") {
    items_.push_back({"cargando", "Buscando recetas...", "", 0});
  }
  index_ = constrain(index, 0, (int)items_.size() - 1);
  screen_ = MENU;
  dirty_ = true;
}

void UI::sendMenu(const char *accion, const char *key, const String &value, int num) {
  if (!send_) return;
  JsonDocument d;
  d["type"] = "menu";
  d["accion"] = accion;
  if (key && num >= 0) d[key] = num;
  else if (key) d[key] = value;
  send_(d);
}

void UI::addTimer(int min) { timers_.push_back(millis() + (uint32_t)min * 60000UL); }

void UI::runItem(const Item &it) {
  const String &id = it.id;
  if (id == "cocina") {
    openMenu("recetas");
    sendMenu("recetas");
  } else if (id == "temporizador") {
    openMenu("temporizador");
  } else if (id == "volver") {
    openMenu("main");
  } else if (id == "timer") {
    addTimer(it.min);
    sendMenu("timer", "min", "", it.min);
    screen_ = CARA;
  } else if (id == "cronometro") {
    cronoAcc_ = 0;
    cronoSince_ = millis();
    cronoRunning_ = true;
    screen_ = CRONO;
  } else if (id == "pomodoro") {
    addTimer(25);
    sendMenu("comando", "texto", "modo foco");
    screen_ = CARA;
  } else if (id == "clima") {
    sendMenu("comando", "texto", "clima");
    screen_ = CARA;
  } else if (id == "chiste") {
    sendMenu("comando", "texto", "contame un chiste");
    screen_ = CARA;
  } else if (id == "modo") {
    sendMenu("modo");
    screen_ = CARA;
  } else if (id == "brillo") {
    // cada toque baja un escalón; después del más bajo vuelve al máximo
    int next = brillo_ > 75 ? 70 : brillo_ > 45 ? 40 : brillo_ > 20 ? 15 : 100;
    setBrightness(next);
    items_[index_].label = "Brillo: " + String(brillo_) + "%";
  } else if (id == "juegos") {
    showPeek("Juegos", "Por ahora estan", "en el panel");
  } else if (id == "seguir") {
    screen_ = CARA;  // vuelve a la pantalla de cocina
  } else if (id == "receta") {
    sendMenu("cocinar", "id", it.extra);
    screen_ = CARA;
  }
  dirty_ = true;
}

void UI::showPeek(const String &a, const String &b, const String &c) {
  peek_[0] = a;
  peek_[1] = b;
  peek_[2] = c;
  peekUntil_ = millis() + 6000;
  screen_ = PEEK;
  dirty_ = true;
}

// ---------- mensajes del servidor

void UI::onServer(JsonDocument &msg) {
  String type = msg["type"] | "";
  if (type == "recetas") {
    if (screen_ != MENU || level_ != "recetas") return;
    items_.clear();
    if (cocina_) {
      String donde = cocinaPaso_ >= 0 ? "paso " + String(cocinaPaso_ + 1) + "/" + String(cocinaTotal_) : "ingredientes";
      items_.push_back({"seguir", "Seguir (" + donde + "): " + sinTildes(cocinaNombre_), "", 0});
    }
    for (JsonObject r : msg["items"].as<JsonArray>()) {
      String rid = r["id"] | "";
      // la receta en curso ya está como "Seguir"
      if (cocina_ && rid == cocinaId_) continue;
      items_.push_back({"receta", sinTildes(String(r["nombre"] | "Receta")), rid, 0});
    }
    if (items_.empty()) items_.push_back({"vacio", "Sin recetas: cargalas en el panel", "", 0});
    items_.push_back({"volver", "Volver", "", 0});
    index_ = 0;
    dirty_ = true;
  } else if (type == "cocina") {
    bool antes = cocina_;
    cocina_ = msg["activa"] | false;
    if (cocina_) {
      cocinaId_ = msg["id"] | "";
      cocinaNombre_ = msg["nombre"] | "";
      cocinaTexto_ = msg["texto"] | "";
      cocinaPaso_ = msg["paso"] | -1;
      cocinaTotal_ = msg["total"] | 0;
      int rest = msg["restante"] | 0;
      cocinaTimerFin_ = rest > 0 ? millis() + rest * 1000UL : 0;
      // empezó una receta: se sale del menú para mostrar la cocina
      if (!antes && screen_ == MENU) screen_ = CARA;
    }
    dirty_ = true;
  }
}

// ---------- gestos (mismo comportamiento que el panel)

void UI::onTap(int x, int y) {
  if (screen_ == CRONO) {
    uint32_t now = millis();
    if (cronoRunning_) cronoAcc_ += now - cronoSince_;
    else cronoSince_ = now;
    cronoRunning_ = !cronoRunning_;
    dirty_ = true;
    return;
  }
  if (screen_ == PEEK) {
    screen_ = CARA;
    dirty_ = true;
    return;
  }
  if (screen_ == MENU) {
    if (!items_.empty()) runItem(items_[index_]);
    return;
  }
  // cocinando, un toque pasa al paso siguiente (tenés las manos ocupadas)
  if (cocina_) {
    sendMenu("cocina", "paso", "siguiente");
    return;
  }
  // fuera de eso, un toque solo hace que te mire
  face_->glance((x - 160) / 8, 1500);
}

void UI::onTripleTap() {
  if (screen_ != CARA) return;
  face_->setEmotion("riendo");
  sendMenu("cosquillas");
}

void UI::onLongPress() {
  if (screen_ == MENU || screen_ == PEEK) return;
  if (screen_ == CARA && cocina_) {
    sendMenu("cocina", "paso", "stop");
    cocina_ = false;
    showPeek("Listo", "Receta terminada");
    return;
  }
  face_->setEmotion("escuchando");
  showPeek("Te escucho...", "(cuando tenga", "microfono)");
}

void UI::onSwipe(Swipe dir) {
  if (screen_ == CRONO) {
    if (dir == Swipe::Arriba || dir == Swipe::Abajo) {
      screen_ = CARA;
      dirty_ = true;
    }
    return;
  }
  if (screen_ == PEEK) screen_ = CARA;
  if (dir == Swipe::Arriba) {
    screen_ = CARA;
  } else if (dir == Swipe::Abajo) {
    if (screen_ == MENU) {
      screen_ = CARA;
    } else {
      struct tm t;
      String hora = getLocalTime(&t, 0) ? String(t.tm_hour < 10 ? "0" : "") + t.tm_hour + ":" + (t.tm_min < 10 ? "0" : "") + t.tm_min : "--:--";
      String wifi = WiFi.status() == WL_CONNECTED ? "WiFi: " + WiFi.SSID() : "Sin WiFi";
      showPeek(hora, wifi, online_ ? "Servidor: conectado" : "Servidor: sin conexion");
      return;
    }
  } else if (screen_ != MENU) {
    openMenu("main");
  } else if (!items_.empty()) {
    int n = items_.size();
    index_ = (index_ + (dir == Swipe::Izquierda ? 1 : -1) + n) % n;
  }
  dirty_ = true;
}

// ---------- dibujo

bool UI::showing() const { return screen_ != CARA || cocina_; }

String UI::clock(uint32_t secs, bool tenths, uint32_t ms) {
  char b[16];
  if (tenths) snprintf(b, sizeof(b), "%02lu:%02lu.%lu", (unsigned long)(secs / 60), (unsigned long)(secs % 60), (unsigned long)(ms / 100 % 10));
  else snprintf(b, sizeof(b), "%lu:%02lu", (unsigned long)(secs / 60), (unsigned long)(secs % 60));
  return b;
}

String UI::badge(uint32_t now) {
  // saca los timers vencidos (el aviso lo da el servidor)
  for (size_t i = 0; i < timers_.size();) {
    if ((int32_t)(timers_[i] - now) <= 0) timers_.erase(timers_.begin() + i);
    else i++;
  }
  if (timers_.empty()) return "";
  uint32_t next = timers_[0];
  for (uint32_t t : timers_)
    if ((int32_t)(t - next) < 0) next = t;
  return clock((next - now + 999) / 1000);
}

void UI::textCenter(const String &s, int y, int size, uint16_t color) {
  int w = s.length() * 6 * size;
  g_->setTextSize(size);
  g_->setTextColor(color);
  g_->setCursor(max(0, (320 - w) / 2), y);
  g_->print(s);
}

void UI::drawMenu() {
  const char *crumb = level_ == "temporizador" ? "Menu > Temporizador" : level_ == "recetas" ? "Menu > Cocina" : "Menu";
  g_->setTextSize(1);
  g_->setTextColor(face_->color());
  g_->setCursor(16, 10);
  g_->print(crumb);

  if (!items_.empty()) {
    String label = sinTildes(items_[index_].label);
    if (label.length() <= 16) {
      textCenter(label, 64, 3, C_TEXT);
    } else {
      String lines[3];
      int n = wrapLines(label, 24, lines, 3);
      for (int i = 0; i < n; i++) textCenter(lines[i], 56 + i * 22 - (n - 1) * 8, 2, C_TEXT);
    }
    // puntitos: en cuál opción estás
    int n = items_.size();
    for (int i = 0; i < n; i++) {
      int cx = 160 + (int)((i - (n - 1) / 2.0f) * 12);
      g_->fillCircle(cx, 138, i == index_ ? 4 : 2, i == index_ ? face_->color() : C_DIM);
    }
  }
  textCenter("< desliza > - toca para entrar - arriba: salir", 158, 1, C_HINT);
}

void UI::drawPeek() {
  textCenter(sinTildes(peek_[0]), 36, 4, C_TEXT);
  textCenter(sinTildes(peek_[1]), 92, 2, C_HINT);
  textCenter(sinTildes(peek_[2]), 118, 2, C_HINT);
}

void UI::drawCrono(uint32_t now) {
  uint32_t ms = cronoAcc_ + (cronoRunning_ ? now - cronoSince_ : 0);
  textCenter(clock(ms / 1000, true, ms), 56, 5, C_TEXT);
  textCenter(cronoRunning_ ? "toca para pausar - arriba: salir" : "en pausa - toca para seguir - arriba: salir", 140, 1, C_HINT);
}

void UI::drawCocina(uint32_t now) {
  String nombre = sinTildes(cocinaNombre_);
  if (nombre.length() > 34) nombre = nombre.substring(0, 33) + "...";
  String crumb = cocinaPaso_ >= 0 ? nombre + " - paso " + (cocinaPaso_ + 1) + "/" + cocinaTotal_ : nombre;
  g_->setTextSize(1);
  g_->setTextColor(face_->color());
  g_->setCursor(16, 10);
  g_->print(crumb);

  bool timer = cocinaTimerFin_ && (int32_t)(cocinaTimerFin_ - now) > 0;
  String lines[5];
  int n = wrapLines(sinTildes(cocinaTexto_), 25, lines, timer ? 3 : 5);
  int y0 = timer ? 30 : 34;
  for (int i = 0; i < n; i++) textCenter(lines[i], y0 + i * 22, 2, C_TEXT);
  if (timer) textCenter(clock((cocinaTimerFin_ - now + 999) / 1000), 104, 4, C_ORANGE);
  textCenter(cocinaPaso_ >= 0 ? "toca: siguiente - mantene: terminar" : "toca para arrancar - mantene: terminar", 158, 1, C_HINT);
}

bool UI::update(uint32_t now) {
  bool showingNow = showing();
  if (wasShowing_ && !showingNow) face_->invalidate();  // volvió a la cara: que se redibuje
  wasShowing_ = showingNow;
  if (!showingNow) return false;

  if (screen_ == PEEK && (int32_t)(now - peekUntil_) > 0) {
    screen_ = CARA;
    dirty_ = true;
    if (!showing()) {
      face_->invalidate();
      return false;
    }
  }
  // lo que tiene reloj se redibuja solo
  bool ticking = screen_ == CRONO || (screen_ == CARA && cocina_ && cocinaTimerFin_);
  if (ticking && now - lastDraw_ > (screen_ == CRONO ? 100u : 500u)) dirty_ = true;
  if (!dirty_) return false;

  g_->fillScreen(C_BG);
  if (screen_ == MENU) drawMenu();
  else if (screen_ == PEEK) drawPeek();
  else if (screen_ == CRONO) drawCrono(now);
  else if (cocina_) drawCocina(now);
  dirty_ = false;
  lastDraw_ = now;
  return true;
}
