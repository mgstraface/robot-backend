#pragma once
#include <Arduino.h>

// La fuente de la pantalla no tiene tildes ni eñes: "canción" -> "cancion", "¿qué?" -> "?que?"
inline String sinTildes(const String &s) {
  String o;
  o.reserve(s.length());
  for (size_t i = 0; i < s.length(); i++) {
    uint8_t c = s[i];
    if (c == 0xC3 && i + 1 < s.length()) {
      uint8_t d = s[++i];
      switch (d) {
        case 0xA1: o += 'a'; break;
        case 0xA9: o += 'e'; break;
        case 0xAD: o += 'i'; break;
        case 0xB3: o += 'o'; break;
        case 0xBA:
        case 0xBC: o += 'u'; break;
        case 0xB1: o += 'n'; break;
        case 0x81: o += 'A'; break;
        case 0x89: o += 'E'; break;
        case 0x8D: o += 'I'; break;
        case 0x93: o += 'O'; break;
        case 0x9A:
        case 0x9C: o += 'U'; break;
        case 0x91: o += 'N'; break;
        default: break;
      }
    } else if (c == 0xC2 && i + 1 < s.length()) {
      uint8_t d = s[++i];
      if (d == 0xBF) o += '?';
      else if (d == 0xA1) o += '!';
      else if (d == 0xBA) o += 'o';
    } else if (c == 0xE2 && i + 2 < s.length()) {
      uint8_t d = s[i + 1], e = s[i + 2];
      i += 2;
      if (d == 0x80 && e == 0xA6) o += "...";
      else if (d == 0x80 && (e == 0x98 || e == 0x99)) o += '\'';
      else if (d == 0x80 && (e == 0x9C || e == 0x9D)) o += '"';
      else if (d == 0x80 && (e == 0x93 || e == 0x94)) o += '-';
    } else if (c < 0x80) {
      o += (char)c;
    }
    // otros caracteres (emojis, etc.) se saltean
  }
  return o;
}

// Corta un texto en renglones de hasta n caracteres. Devuelve cuántos renglones usó (máx. maxLines).
inline int wrapLines(const String &text, int n, String *out, int maxLines) {
  int count = 0;
  String line;
  int i = 0, len = text.length();
  bool cortado = false;
  while (i < len) {
    int j = text.indexOf(' ', i);
    if (j < 0) j = len;
    String w = text.substring(i, j);
    i = j + 1;
    if (!w.length()) continue;
    if (line.length() && (int)(line.length() + 1 + w.length()) > n) {
      if (count == maxLines - 1) {
        cortado = true;
        break;
      }
      out[count++] = line;
      line = w;
    } else {
      line = line.length() ? line + " " + w : w;
    }
  }
  if (line.length() && count < maxLines) {
    if (cortado) line = (int)line.length() + 3 > n ? line.substring(0, n > 3 ? n - 3 : 0) + "..." : line + "...";
    if ((int)line.length() > n) line = line.substring(0, n - 3) + "...";
    out[count++] = line;
  }
  return count;
}
