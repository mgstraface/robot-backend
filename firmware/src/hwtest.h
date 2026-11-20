#pragma once
#include <Arduino.h>

// Pruebas de hardware que se disparan desde el panel (celu): parlante, micrófono, touch y MPU6050.
// Cada una devuelve un texto corto con el resultado (se muestra en la pantalla del robot y se manda al servidor).
namespace HwTest {
String audio();     // pitido de 0,6 s por el parlante (MAX98357A)
String eco();       // graba 3 s y los reproduce ahí mismo (sin WiFi ni servidor): para probar el micrófono
String micro();     // mide el nivel del micrófono durante ~2 s (INMP441): hablale o soplale
String sensores();  // touch cabeza/panza/espalda (~6 s, tocalos) + MPU6050
}
