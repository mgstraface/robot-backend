#include "face.h"

static const uint16_t BG = 0x0000;
static const uint16_t WHITE = 0xFFFF;
static const uint16_t CHEEK = 0xF2B2;   // rosado
static const uint16_t TEAR = 0x7E3F;    // celeste
static const uint16_t TONGUE = 0xFB51;

static const float L = 78, R = 162, Yc = 90;  // centros de los ojos (como en el panel)

// Emociones que no vuelven solas a neutral
static bool sticky(const String &e) { return e == "neutral" || e == "pensando" || e == "escuchando" || e == "dormido"; }

uint16_t Face::parseColor(const char *hex) {
  if (!hex || hex[0] != '#' || strlen(hex) < 7) return 0x5F1F;
  long v = strtol(hex + 1, nullptr, 16);
  uint8_t r = (v >> 16) & 0xFF, g = (v >> 8) & 0xFF, b = v & 0xFF;
  return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
}

void Face::begin(Arduino_GFX *canvas) {
  g_ = canvas;
  nextBlink_ = millis() + 2500;
}

void Face::setEmotion(const String &emotion) {
  emotion_ = emotion.length() ? emotion : "neutral";
  emotionAt_ = millis();
  dirty_ = true;
}

void Face::showText(const String &text, uint32_t ms) {
  text_ = text;
  textUntil_ = millis() + ms;
  dirty_ = true;
}

bool Face::update(uint32_t now) {
  // parpadeo
  if (!blinking_ && now >= nextBlink_) {
    blinking_ = true;
    blinkEnd_ = now + 120;
    dirty_ = true;
  } else if (blinking_ && now >= blinkEnd_) {
    blinking_ = false;
    nextBlink_ = now + 2500 + random(0, 3500);
    dirty_ = true;
  }
  // vuelve a neutral a los 7 s, como el panel
  if (!sticky(emotion_) && now - emotionAt_ > 7000) setEmotion("neutral");
  if (textUntil_ && now > textUntil_) {
    textUntil_ = 0;
    text_ = "";
    dirty_ = true;
  }
  // la boca que habla se anima sola (~12 cuadros por segundo)
  if (talking_ && now - lastFrame_ > 80) dirty_ = true;
  if (!dirty_) return false;
  draw(now);
  lastFrame_ = now;
  dirty_ = false;
  return true;
}

void Face::eye(float cx, float w, float h, float dy, float dx) {
  if (blinking_) h = max(4.0f, h * 0.08f);
  float r = min(18.0f, w / 2);
  g_->fillRoundRect(X(cx - w / 2 + dx), Y(Yc - h / 2 + dy), (int)w, (int)h, (int)min(r, h / 2), eye_);
}

// Párpado: tapa la parte de arriba del ojo con una diagonal (inner = lado de la nariz)
void Face::lid(float cx, float inner, float outer, bool left) {
  float top = Yc - 34;
  float yl = left ? outer : inner;
  float yr = left ? inner : outer;
  int x0 = X(cx - 40), x1 = X(cx + 40);
  g_->fillRect(x0, 0, x1 - x0, Y(top), BG);
  g_->fillTriangle(x0, Y(top), x1, Y(top), x0, Y(top + yl), BG);
  g_->fillTriangle(x1, Y(top), x1, Y(top + yr), x0, Y(top + yl), BG);
  g_->fillTriangle(x0, Y(top + yl), x1, Y(top + yr), x0, Y(top), BG);
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
    g_->fillRect(X(92), Y(108), 56, 28, BG);  // deja solo la mitad de abajo
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

void Face::draw(uint32_t now) {
  g_->fillScreen(BG);
  const String &e = emotion_;

  if (e == "feliz") {
    thickQuad(L - 22, Yc + 8, L, Yc - 26, L + 22, Yc + 8, 4.5, eye_);
    thickQuad(R - 22, Yc + 8, R, Yc - 26, R + 22, Yc + 8, 4.5, eye_);
    g_->fillEllipse(X(L - 18), Y(Yc + 30), 12, 6, CHEEK);
    g_->fillEllipse(X(R + 18), Y(Yc + 30), 12, 6, CHEEK);
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
    g_->fillCircle(X(L) + jitter, Y(Yc), p, BG);
    g_->fillCircle(X(R) + jitter, Y(Yc), p, BG);
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
    g_->fillRoundRect(X(128), Y(142), 14, 16, 6, TONGUE);
  } else if (e == "llorando") {
    thickQuad(L - 20, Yc, L, Yc - 14, L + 20, Yc, 4, eye_);
    thickQuad(R - 20, Yc, R, Yc - 14, R + 20, Yc, 4, eye_);
    int off = (now / 60) % 18;
    for (int y = 6 + off; y < 76; y += 18) {
      g_->fillRoundRect(X(L - 7), Y(Yc + y), 5, 8, 2, TEAR);
      g_->fillRoundRect(X(R + 3), Y(Yc + y), 5, 8, 2, TEAR);
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

  if (text_.length()) {
    g_->fillRect(0, 150, 320, 22, BG);
    g_->setTextColor(WHITE);
    g_->setTextSize(1);
    g_->setCursor(8, 158);
    g_->print(text_.substring(0, 50));
  }
}
