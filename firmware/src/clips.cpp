#include "clips.h"

#include <esp_heap_caps.h>

static const int W = 320, H = 172;

// El archivo va adentro del firmware (board_build.embed_files en platformio.ini)
extern const uint8_t caras_start[] asm("_binary_data_caras_bin_start");
extern const uint8_t caras_end[] asm("_binary_data_caras_bin_end");

static inline uint16_t rd16(const uint8_t *p) { return p[0] | (p[1] << 8); }
static inline uint32_t rd32(const uint8_t *p) { return p[0] | (p[1] << 8) | (p[2] << 16) | ((uint32_t)p[3] << 24); }

bool ClipPlayer::begin() { return begin(false); }

bool ClipPlayer::begin(bool quiet) {
  bin_ = caras_start;
  len_ = caras_end - caras_start;
  if (len_ < 16 || memcmp(bin_, "CARA", 4) || bin_[4] != 2) {
    Serial.println("[caras] archivo inválido: uso las caras dibujadas a mano");
    return false;
  }
  size_t p = 5;
  palN_ = rd16(bin_ + p);
  p += 2;
  pal_ = bin_ + p;
  p += palN_ * 2;
  int n = rd16(bin_ + p);
  p += 2;
  clips_.reserve(n);
  for (int i = 0; i < n; i++) {
    Clip c;
    c.nameLen = bin_[p++];
    c.name = (const char *)bin_ + p;
    p += c.nameLen;
    c.ms = rd16(bin_ + p);
    c.frames = rd16(bin_ + p + 2);
    c.loop = bin_[p + 4];
    c.off = rd32(bin_ + p + 5);
    p += 9;
    clips_.push_back(c);
  }
  codes_ = (uint8_t *)heap_caps_malloc(W * H, MALLOC_CAP_SPIRAM);
  if (!codes_) codes_ = (uint8_t *)malloc(W * H);
  if (codes_) memset(codes_, 0, W * H);
  if (!quiet) Serial.printf("[caras] %d caras y animaciones (%u KB)\n", n, (unsigned)(len_ / 1024));
  return ok();
}

int ClipPlayer::find(const String &key) const {
  for (size_t i = 0; i < clips_.size(); i++) {
    const Clip &c = clips_[i];
    if (c.nameLen == key.length() && !memcmp(c.name, key.c_str(), c.nameLen)) return i;
  }
  return -1;
}

uint32_t ClipPlayer::durationMs(int idx) const {
  if (idx < 0) return 0;
  return (uint32_t)clips_[idx].ms * clips_[idx].frames;
}

void ClipPlayer::start(int idx, uint32_t now) {
  cur_ = idx;
  ended_ = false;
  if (idx < 0) return;
  frame_ = 0;
  p_ = clips_[idx].off;
  decodeFrame();  // el primer cuadro trae todas las filas
  next_ = now + clips_[idx].ms;
}

// Aplica el cuadro siguiente sobre el anterior (solo trae lo que cambió)
void ClipPlayer::decodeFrame() {
  const uint8_t *d = bin_;
  uint32_t p = p_;
  while (p < len_) {
    uint8_t y = d[p++];
    if (y == 0xFF) break;
    uint8_t op = d[p++];
    if (y >= H) return;  // archivo roto: no seguir
    uint8_t *row = codes_ + y * W;
    if (op == 1) {
      if (y > 0) memcpy(row, row - W, W);
      continue;
    }
    uint16_t x = rd16(d + p), end = x + rd16(d + p + 2);
    p += 4;
    while (x < end && x < W) {
      uint8_t c = d[p], len = d[p + 1];
      p += 2;
      if (x + len > W) len = W - x;
      memset(row + x, c, len);
      x += len;
    }
  }
  p_ = p;
}

bool ClipPlayer::tick(uint32_t now) {
  if (cur_ < 0 || ended_) return false;
  const Clip &c = clips_[cur_];
  if (c.frames <= 1 || (int32_t)(now - next_) < 0) return false;
  if (frame_ + 1 >= c.frames) {
    if (!c.loop) {
      ended_ = true;
      return false;
    }
    frame_ = 0;
    p_ = c.off;
  } else {
    frame_++;
  }
  decodeFrame();
  next_ += c.ms;
  if ((int32_t)(now - next_) > 200) next_ = now + c.ms;  // si se atrasó mucho, no corre para alcanzar
  return true;
}

void ClipPlayer::buildLut(uint16_t eye) {
  int er = (eye >> 11) & 31, eg = (eye >> 5) & 63, eb = eye & 31;
  for (int i = 0; i < 16; i++) {
    int k = i > 7 ? 7 : i;
    lut_[i] = ((er * k / 7) << 11) | ((eg * k / 7) << 5) | (eb * k / 7);
  }
  for (int i = 16; i < 256; i++) lut_[i] = i - 16 < palN_ ? rd16(pal_ + (i - 16) * 2) : 0;
  lutEye_ = eye;
  lutOk_ = true;
}

void ClipPlayer::blit(uint16_t *fb, uint16_t eye, int dx) {
  if (!fb || !codes_) return;
  if (!lutOk_ || eye != lutEye_) buildLut(eye);
  for (int y = 0; y < H; y++) {
    uint16_t *dst = fb + y * W;
    const uint8_t *src = codes_ + y * W;
    if (!dx) {
      for (int x = 0; x < W; x++) dst[x] = lut_[src[x]];
    } else {
      for (int x = 0; x < W; x++) {
        int sx = x - dx;
        dst[x] = (sx >= 0 && sx < W) ? lut_[src[sx]] : lut_[0];
      }
    }
  }
}

void ClipPlayer::blitRegion(uint16_t *fb, uint16_t eye, int x0, int y0, int w, int h, int dx) {
  if (!fb || !codes_ || cur_ < 0) return;
  if (!lutOk_ || eye != lutEye_) buildLut(eye);
  for (int y = y0; y < y0 + h && y < H; y++) {
    for (int x = x0; x < x0 + w && x < W; x++) {
      int sx = x - dx;
      fb[y * W + x] = (sx >= 0 && sx < W) ? lut_[codes_[y * W + sx]] : lut_[0];
    }
  }
}
