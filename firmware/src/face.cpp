#include "face.h"

#include "text.h"

static const uint16_t C_BG = 0x0000;
static const uint16_t C_WHITE = 0xFFFF;
static const uint16_t C_CHEEK = 0xF2B2;   // rosado
static const uint16_t C_TEAR = 0x7E3F;    // celeste
static const uint16_t C_TONGUE = 0xFB51;
static const uint16_t C_RED = 0xD003;     // rojo Newell's
static const uint16_t C_DARK = 0x2104;    // "negro" que se ve sobre el fondo negro
static const uint16_t C_BLOOD = 0xB800;
static const uint16_t C_MAW = 0x3000;
static const uint16_t C_YELLOW = 0xFE60;
static const uint16_t C_GRAY = 0xBDF7;
static const uint16_t C_BLUE = 0x5D7F;

static const float L = 78, R = 162, Yc = 90;  // centros de los ojos (como en el panel)

// Emociones que no vuelven solas a neutral
static bool sticky(const String &e) { return e == "neutral" || e == "pensando" || e == "escuchando" || e == "dormido"; }

uint16_t Face::parseColor(const char *hex) {
  if (!hex || hex[0] != '#' || strlen(hex) < 7) return 0x5F1F;
  long v = strtol(hex + 1, nullptr, 16);
  uint8_t r = (v >> 16) & 0xFF, g = (v >> 8) & 0xFF, b = v & 0xFF;
  return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
}

void Face::begin(Arduino_Canvas *canvas) {
  g_ = canvas;
  canvas_ = canvas;
  useClips_ = clips_.begin();
  if (useClips_) mouth_.begin(true);
  nextBlink_ = millis() + 2500;
}

void Face::setEmotion(const String &emotion) {
  emotion_ = emotion.length() ? emotion : "neutral";
  emotionAt_ = millis();
  dirty_ = true;
}

void Face::showText(const String &text, uint32_t ms) {
  text_ = sinTildes(text);
  textUntil_ = millis() + ms;
  dirty_ = true;
}

// Duración de cada acción (las mismas que el panel)
static uint32_t actionMs(const String &a) {
  if (a == "gol") return 5000;
  if (a == "bandera") return 4500;
  if (a == "risa") return 3600;
  if (a == "lagrima") return 4000;
  if (a == "apagon") return 3200;
  if (a == "tercerOjo") return 3800;
  if (a == "colmillos" || a == "mordisco") return 3000;
  if (a == "clima") return 5200;
  return 0;  // desconocida: no se hace
}

void Face::playAction(const String &name, const String &extra) {
  String a = name, x = extra;
  int colon = a.indexOf(':');  // "clima:lluvia"
  if (colon >= 0) {
    if (!x.length()) x = a.substring(colon + 1);
    a = a.substring(0, colon);
  }
  if (a == "colmillos") a = "mordisco";  // en el panel se llama así
  uint32_t ms = 0;
  if (useClips_) {
    String st = terror_ ? "terror" : "tierno";
    String name = a == "clima" ? "clima:" + (x.length() ? x : String("despejado")) : a;
    int idx = clips_.find("a/" + st + "/" + name);
    if (idx < 0) idx = clips_.find("a/tierno/" + name);
    if (idx < 0) idx = clips_.find("a/terror/" + name);
    ms = clips_.durationMs(idx);
  }
  if (!ms) ms = actionMs(a);
  if (!ms) return;
  action_ = a;
  actionExtra_ = x;
  actionStart_ = millis();
  actionUntil_ = actionStart_ + ms;
  dirty_ = true;
}

// Vida propia (como el panel): en neutral y sin nada que hacer, cada tanto hace alguna animación suya
void Face::idleLife(uint32_t now) {
  if (!nextIdle_) nextIdle_ = now + 15000 + random(0, 20000);
  if ((int32_t)(now - nextIdle_) < 0) return;
  nextIdle_ = now + 20000 + random(0, 30000);
  if (emotion_ != "neutral" || action_.length() || talking_) return;
  String pre = String("a/") + (terror_ ? "terror" : "tierno") + "/";
  std::vector<String> opciones;
  for (int i = 0; i < clips_.count(); i++) {
    String n = clips_.name(i);
    if (!n.startsWith(pre)) continue;
    String a = n.substring(pre.length());
    // las que dispara el servidor no son de vida propia
    if (a == "gol" || a == "bandera" || a.startsWith("clima")) continue;
    opciones.push_back(a);
  }
  if (!opciones.empty()) playAction(opciones[random(0, opciones.size())]);
}

// Qué clip tiene que estar sonando ahora
String Face::clipKey() const {
  String st = terror_ ? "terror" : "tierno";
  if (action_.length()) {
    String name = action_ == "clima" ? "clima:" + (actionExtra_.length() ? actionExtra_ : String("despejado")) : action_;
    return "a/" + st + "/" + name;
  }
  return "e/" + st + "/" + emotion_;
}

// Caras que se mueven solas (hay que redibujarlas seguido)
bool Face::animated() const {
  return action_.length() || emotion_ == "llorando" || emotion_ == "asustado" || emotion_ == "pensando";
}

bool Face::update(uint32_t now) {
  if (glanceUntil_ && (int32_t)(now - glanceUntil_) > 0) {
    glanceUntil_ = 0;
    glanceDx_ = 0;
    dirty_ = true;
  }
  if (action_.length() && (int32_t)(now - actionUntil_) > 0) {
    action_ = "";
    dirty_ = true;
  }
  if (useClips_) {
    idleLife(now);
    // caras filmadas del panel: elegir el clip y avanzar cuadros (el parpadeo ya viene adentro)
    String key = clipKey();
    if (key != clipKey_) {
      clipKey_ = key;
      int idx = clips_.find(key);
      if (idx < 0 && key.startsWith("a/terror/")) idx = clips_.find("a/tierno/" + key.substring(9));
      if (idx < 0 && key.startsWith("e/")) idx = clips_.find(String("e/") + (terror_ ? "terror" : "tierno") + "/neutral");
      clips_.start(idx, now);
      dirty_ = true;
    }
    if (clips_.tick(now)) dirty_ = true;
    // boca hablando (no durante las acciones, que tienen su propia animación)
    if (talking_ && (int32_t)(now - talkingUntil_) > 0) talking_ = false;
    if (talking_ && !action_.length()) {
      String mk = String("boca/") + (terror_ ? "terror" : "tierno");
      if (mk != mouthKey_) {
        mouthKey_ = mk;
        mouth_.start(mouth_.find(mk), now);
        dirty_ = true;
      }
      if (mouth_.tick(now)) dirty_ = true;
    } else if (mouthKey_.length()) {
      mouthKey_ = "";
      mouth_.start(-1, now);
      dirty_ = true;
    }
  } else if (!blinking_ && now >= nextBlink_) {  // parpadeo
    blinking_ = true;
    blinkEnd_ = now + 120;
    dirty_ = true;
  } else if (blinking_ && now >= blinkEnd_) {
    blinking_ = false;
    nextBlink_ = now + 2500 + random(0, 3500);
    dirty_ = true;
  }
  // vuelve a neutral a los 7 s, como el panel
  // (con signo: si la emoción llegó después de tomar "now", la resta no da negativa gigante)
  if (!sticky(emotion_) && (int32_t)(now - emotionAt_) > 7000) setEmotion("neutral");
  if (textUntil_ && (int32_t)(now - textUntil_) > 0) {
    textUntil_ = 0;
    text_ = "";
    dirty_ = true;
  }
  // la boca que habla se anima sola (~12 cuadros por segundo)
  if (talking_ && now - lastFrame_ > 80) dirty_ = true;
  if (!useClips_ && animated() && now - lastFrame_ > 40) dirty_ = true;  // ~25 cuadros por segundo
  if (!dirty_) return false;
  draw(now);
  lastFrame_ = now;
  dirty_ = false;
  return true;
}

void Face::eye(float cx, float w, float h, float dy, float dx) {
  if (blinking_) h = max(4.0f, h * 0.08f);
  float r = min(18.0f, w / 2);
  dx += glanceDx_;
  g_->fillRoundRect(X(cx - w / 2 + dx), Y(Yc - h / 2 + dy), (int)w, (int)h, (int)min(r, h / 2), eye_);
}

// Párpado: tapa la parte de arriba del ojo con una diagonal (inner = lado de la nariz)
void Face::lid(float cx, float inner, float outer, bool left) {
  float top = Yc - 34;
  float yl = left ? outer : inner;
  float yr = left ? inner : outer;
  int x0 = X(cx - 40), x1 = X(cx + 40);
  g_->fillRect(x0, 0, x1 - x0, Y(top), C_BG);
  g_->fillTriangle(x0, Y(top), x1, Y(top), x0, Y(top + yl), C_BG);
  g_->fillTriangle(x1, Y(top), x1, Y(top + yr), x0, Y(top + yl), C_BG);
  g_->fillTriangle(x0, Y(top + yl), x1, Y(top + yr), x0, Y(top), C_BG);
}

// Curva gruesa (bezier cuadrática) hecha con círculos
void Face::thickQuad(float x0, float y0, float cx, float cy, float x1, float y1, float r, uint16_t c) {
  for (int i = 0; i <= 24; i++) {
    float t = i / 24.0f, u = 1 - t;
    float x = u * u * x0 + 2 * u * t * cx + t * t * x1;
    float y = u * u * y0 + 2 * u * t * cy + t * t * y1;
    g_->fillCircle(X(x), Y(y), (int)r, c);
  }
}

void Face::mouth(const char *kind) {
  if (talking_) {
    int h = 3 + (millis() / 80) % 4 * 3;  // abre y cierra
    g_->fillRoundRect(X(108), Y(146 - h / 2), 24, max(4, h), 6, eye_);
    return;
  }
  if (!kind) return;
  if (!strcmp(kind, "sonrisa")) thickQuad(100, 140, 120, 158, 140, 140, 3, eye_);
  else if (!strcmp(kind, "sonrisita")) thickQuad(108, 142, 120, 151, 132, 142, 3, eye_);
  else if (!strcmp(kind, "triste")) thickQuad(102, 152, 120, 138, 138, 152, 3, eye_);
  else if (!strcmp(kind, "o")) g_->fillCircle(X(120), Y(147), 9, eye_);
  else if (!strcmp(kind, "recta")) g_->fillRoundRect(X(106), Y(145), 28, 5, 2, eye_);
  else if (!strcmp(kind, "carcajada")) {
    g_->fillRect(X(92), Y(136), 56, 6, eye_);
    g_->fillCircle(X(120), Y(140), 26, eye_);
    g_->fillRect(X(92), Y(108), 56, 28, C_BG);  // deja solo la mitad de abajo
  } else if (!strcmp(kind, "ondulada")) {
    for (int i = 0; i < 4; i++) thickQuad(96 + i * 12, 148, 102 + i * 12, 142 - (i % 2) * 0, 108 + i * 12, 148, 2, eye_);
  } else if (!strcmp(kind, "grr")) {
    for (int i = 0; i < 6; i++) g_->drawLine(X(96 + i * 8), Y(150 - (i % 2) * 7), X(104 + i * 8), Y(150 - ((i + 1) % 2) * 7), eye_);
  }
}

void Face::heart(float cx, float cy) {
  g_->fillCircle(X(cx - 10), Y(cy - 6), 12, eye_);
  g_->fillCircle(X(cx + 10), Y(cy - 6), 12, eye_);
  g_->fillTriangle(X(cx - 22), Y(cy - 2), X(cx + 22), Y(cy - 2), X(cx), Y(cy + 22), eye_);
}

void Face::terrorEyes() {
  eye(L);
  eye(R);
  lid(L, 20, 6, true);
  lid(R, 20, 6, false);
}

// Boca con dientes y colmillos; open de 0 (cerrada) a 1 (bien abierta)
void Face::fangs(float open) {
  float h = 10 + 26 * open;
  g_->fillRect(X(72), Y(132), 96, (int)(h * 0.5f), C_MAW);
  g_->fillEllipse(X(120), Y(132 + h * 0.5f), 48, (int)(h * 0.5f), C_MAW);
  for (int x = 82; x <= 152; x += 10) {
    if (x == 92 || x == 142) continue;
    g_->fillTriangle(X(x), Y(134), X(x + 5), Y(141), X(x + 10), Y(134), C_WHITE);
  }
  g_->fillTriangle(X(90), Y(133), X(97), Y(152), X(104), Y(133), C_WHITE);
  g_->fillTriangle(X(136), Y(133), X(143), Y(152), X(150), Y(133), C_WHITE);
}

void Face::cloud(float cx, float cy, uint16_t c) {
  g_->fillCircle(X(cx - 10), Y(cy + 2), 9, c);
  g_->fillCircle(X(cx + 2), Y(cy - 4), 12, c);
  g_->fillCircle(X(cx + 13), Y(cy + 3), 8, c);
  g_->fillRect(X(cx - 10), Y(cy + 2), 23, 9, c);
}

void Face::drawAction(uint32_t now) {
  uint32_t t = now - actionStart_;
  const String &a = action_;

  if (a == "gol") {
    // rayas rojinegras que bajan y se deslizan, ojos > < saltando y GOOOL
    int h = (int)(172 * min(1.0f, t / 500.0f));
    int off = (t / 25) % 40;
    for (int i = -1; i < 9; i++) g_->fillRect(i * 40 + off, 0, 20, h, C_RED);
    float b = sinf(t / 120.0f) * 6;
    thickQuad(L - 18, Yc - 30 + b, L - 4, Yc - 24 + b, L + 10, Yc - 18 + b, 4, eye_);
    thickQuad(L + 10, Yc - 18 + b, L - 4, Yc - 12 + b, L - 18, Yc - 6 + b, 4, eye_);
    thickQuad(R + 18, Yc - 30 + b, R + 4, Yc - 24 + b, R - 10, Yc - 18 + b, 4, eye_);
    thickQuad(R - 10, Yc - 18 + b, R + 4, Yc - 12 + b, R + 18, Yc - 6 + b, 4, eye_);
    g_->setTextSize(5);
    int y = Y(150) - 34 + (int)b;
    g_->setTextColor(C_BG);
    g_->setCursor(87, y + 3);
    g_->print("GOOOL");
    g_->setTextColor(C_WHITE);
    g_->setCursor(85, y);
    g_->print("GOOOL");
  } else if (a == "bandera") {
    // bandera rojinegra flameando
    for (int x = 40; x < 200; x += 4) {
      float w = sinf(x / 18.0f - t / 140.0f) * 5;
      g_->fillRect(X(x), Y(40 + w), 4, 100, x < 120 ? C_RED : C_DARK);
    }
    thickQuad(100, 158, 120, 170, 140, 158, 3, eye_);
  } else if (a == "risa") {
    eye(L);
    eye(R);
    lid(L, 30, 18, true);
    lid(R, 30, 18, false);
    fangs(0.5f + 0.5f * sinf(t / 90.0f));
  } else if (a == "colmillos" || a == "mordisco") {
    terrorEyes();
    fangs(0.4f + 0.6f * fabsf(sinf(t / 150.0f)));
  } else if (a == "lagrima") {
    terrorEyes();
    float y = 106 + (t % 1600) / 1600.0f * 60;
    g_->fillTriangle(X(74), Y(y + 8), X(82), Y(y + 8), X(78), Y(y - 2), C_BLOOD);
    g_->fillCircle(X(78), Y(y + 9), 4, C_BLOOD);
  } else if (a == "apagon") {
    // la luz titila, se corta y vuelve
    bool on;
    if (t < 2200) on = (((t / 110) * 2654435761u) >> 29) != 0;
    else on = t > 2800;
    if (on) terrorEyes();
  } else if (a == "tercerOjo") {
    terrorEyes();
    uint32_t ms = actionUntil_ - actionStart_;
    // se abre al principio y se cierra al final
    uint32_t edge = min(t, ms > t ? ms - t : 0);
    float open = min(1.0f, edge / 500.0f);
    if (open > 0.05f) {
      g_->fillEllipse(X(120), Y(30), 16, max(1, (int)(11 * open)), eye_);
      g_->fillEllipse(X(120), Y(30), 3, max(1, (int)(9 * open)), C_BG);
    }
  } else if (a == "clima") {
    eye(L, 36, 42, 22);
    eye(R, 36, 42, 22);
    const String &k = actionExtra_;
    if (k == "despejado" || k == "parcial" || !k.length()) {
      float rot = t / 900.0f;
      for (int i = 0; i < 8; i++) {
        float ang = rot + i * 0.785f;
        g_->drawLine(X(120 + cosf(ang) * 18), Y(34 + sinf(ang) * 18), X(120 + cosf(ang) * 24), Y(34 + sinf(ang) * 24), C_YELLOW);
      }
      g_->fillCircle(X(120), Y(34), 13, C_YELLOW);
      if (k == "parcial") cloud(132, 42, C_GRAY);
    } else if (k == "niebla") {
      for (int i = 0; i < 4; i++) g_->fillRoundRect(X(92 + (i % 2) * 8), Y(20 + i * 9), 48, 4, 2, C_GRAY);
    } else {
      cloud(118, 28, C_GRAY);
      if (k == "lluvia" || k == "tormenta" || k == "nieve") {
        for (int i = 0; i < 4; i++) {
          int y = 44 + (int)((t / 30 + i * 7) % 20);
          int x = 106 + i * 9;
          if (k == "nieve") g_->fillCircle(X(x), Y(y), 2, C_WHITE);
          else g_->fillRect(X(x), Y(y), 2, 6, C_BLUE);
        }
      }
      if (k == "tormenta" && (t / 300) % 3 == 0) {
        g_->fillTriangle(X(120), Y(36), X(112), Y(54), X(122), Y(52), C_YELLOW);
        g_->fillTriangle(X(122), Y(48), X(114), Y(66), X(126), Y(50), C_YELLOW);
      }
    }
  }
}

void Face::draw(uint32_t now) {
  if (useClips_ && clips_.current() >= 0) {
    clips_.blit(canvas_->getFramebuffer(), eye_, glanceDx_);
    // tapa la boca de la cara con la boca hablando (misma zona que en el panel)
    if (mouth_.current() >= 0) mouth_.blitRegion(canvas_->getFramebuffer(), eye_, 112, 124, 96, 48, glanceDx_);
  } else {
    drawVector(now);
  }
  if (badge_.length()) {
    g_->setTextSize(2);
    g_->setTextColor(0xF52A);
    g_->setCursor(320 - 14 - badge_.length() * 12, 10);
    g_->print(badge_);
  }

  if (text_.length()) {
    g_->fillRect(0, 150, 320, 22, C_BG);
    g_->setTextColor(C_WHITE);
    g_->setTextSize(1);
    g_->setCursor(8, 158);
    g_->print(text_.substring(0, 50));
  }
}

void Face::drawVector(uint32_t now) {
  g_->fillScreen(C_BG);
  const String &e = emotion_;

  if (action_.length()) {
    drawAction(now);
  } else

  if (e == "feliz") {
    thickQuad(L - 22, Yc + 8, L, Yc - 26, L + 22, Yc + 8, 4.5, eye_);
    thickQuad(R - 22, Yc + 8, R, Yc - 26, R + 22, Yc + 8, 4.5, eye_);
    g_->fillEllipse(X(L - 18), Y(Yc + 30), 12, 6, C_CHEEK);
    g_->fillEllipse(X(R + 18), Y(Yc + 30), 12, 6, C_CHEEK);
    mouth("sonrisa");
  } else if (e == "triste") {
    eye(L, 40, 48, 6);
    eye(R, 40, 48, 6);
    lid(L, 8, 28, true);
    lid(R, 8, 28, false);
    mouth("triste");
  } else if (e == "enojado") {
    eye(L);
    eye(R);
    lid(L, 30, 8, true);
    lid(R, 30, 8, false);
    mouth("grr");
  } else if (e == "sorprendido" || e == "asustado") {
    int r = e == "asustado" ? 26 : 28;
    int p = e == "asustado" ? 5 : 9;
    int jitter = e == "asustado" ? (int)((now / 60) % 3) - 1 : 0;
    g_->fillCircle(X(L) + jitter, Y(Yc), r, eye_);
    g_->fillCircle(X(R) + jitter, Y(Yc), r, eye_);
    g_->fillCircle(X(L) + jitter, Y(Yc), p, C_BG);
    g_->fillCircle(X(R) + jitter, Y(Yc), p, C_BG);
    mouth(e == "asustado" ? "ondulada" : "o");
  } else if (e == "pensando") {
    eye(L, 36, 44, -10, 8);
    eye(R, 36, 44, -10, 8);
    for (int i = 0; i < 3; i++) {
      bool on = ((now / 400) % 3) == (uint32_t)i;
      g_->fillCircle(X(R - 10 + i * 14), Y(Yc + 52), 4, on ? eye_ : (uint16_t)(eye_ >> 1 & 0x7BEF));
    }
  } else if (e == "dormido") {
    thickQuad(L - 20, Yc + 4, L, Yc + 16, L + 20, Yc + 4, 4.5, eye_);
    thickQuad(R - 20, Yc + 4, R, Yc + 16, R + 20, Yc + 4, 4.5, eye_);
    g_->setTextColor(eye_);
    g_->setTextSize(2);
    g_->setCursor(X(R + 30), Y(Yc - 36));
    g_->print("z");
    g_->setTextSize(1);
    g_->setCursor(X(R + 46), Y(Yc - 50));
    g_->print("z");
  } else if (e == "amor") {
    heart(L, Yc);
    heart(R, Yc);
    mouth("sonrisita");
  } else if (e == "curioso" || e == "confundido") {
    eye(L, 34, 42, 6);
    eye(R, 46, 64, -2);
    mouth(e == "confundido" ? "ondulada" : "sonrisita");
  } else if (e == "escuchando") {
    eye(L, 44, 60);
    eye(R, 44, 60);
  } else if (e == "riendo" || e == "emocionado") {
    for (int k = 0; k < 2; k++) {
      float cx = k ? R : L, s = k ? -1 : 1;
      g_->drawLine(X(cx - 18 * s), Y(Yc - 12), X(cx + 10 * s), Y(Yc), eye_);
      g_->drawLine(X(cx + 10 * s), Y(Yc), X(cx - 18 * s), Y(Yc + 12), eye_);
      thickQuad(cx - 18 * s, Yc - 12, cx - 4 * s, Yc - 6, cx + 10 * s, Yc, 3, eye_);
      thickQuad(cx + 10 * s, Yc, cx - 4 * s, Yc + 6, cx - 18 * s, Yc + 12, 3, eye_);
    }
    mouth("carcajada");
  } else if (e == "muerto") {
    for (int k = 0; k < 2; k++) {
      float cx = k ? R : L;
      thickQuad(cx - 16, Yc - 16, cx, Yc, cx + 16, Yc + 16, 4, eye_);
      thickQuad(cx + 16, Yc - 16, cx, Yc, cx - 16, Yc + 16, 4, eye_);
    }
    g_->fillRoundRect(X(104), Y(140), 42, 5, 2, eye_);
    g_->fillRoundRect(X(128), Y(142), 14, 16, 6, C_TONGUE);
  } else if (e == "llorando") {
    thickQuad(L - 20, Yc, L, Yc - 14, L + 20, Yc, 4, eye_);
    thickQuad(R - 20, Yc, R, Yc - 14, R + 20, Yc, 4, eye_);
    int off = (now / 60) % 18;
    for (int y = 6 + off; y < 76; y += 18) {
      g_->fillRoundRect(X(L - 7), Y(Yc + y), 5, 8, 2, C_TEAR);
      g_->fillRoundRect(X(R + 3), Y(Yc + y), 5, 8, 2, C_TEAR);
    }
    mouth("ondulada");
  } else {
    // neutral (y las que todavía no están dibujadas en el robot)
    eye(L);
    eye(R);
    if (terror_) {
      lid(L, 20, 6, true);
      lid(R, 20, 6, false);
    }
    mouth(nullptr);
  }
}
