#pragma once
#include <Arduino.h>
#include <Arduino_GFX_Library.h>

// Modo configuración del WiFi, sin compu: Robi crea su propia red "Robi-config"; te conectás desde
// el celu, se abre una página, elegís tu WiFi y ponés la clave. Guarda hasta 3 redes así
// (además de las de secrets.h) y se reinicia para conectarse.
namespace WifiPortal {
void start(Arduino_Canvas *canvas, uint16_t color);
bool active();
void loop();  // llamar seguido mientras esté activo

// Redes cargadas desde el celu (las más nuevas primero)
int saved(String *ssid, String *pass, int max);
}  // namespace WifiPortal
