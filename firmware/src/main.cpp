// Robi — firmware etapa 1: pantalla + WiFi + conexión con el servidor.
// Muestra la cara, recibe emociones/apariencia/respuestas del servidor y las dibuja.
// Etapas siguientes (táctiles, IMU, servos, audio) se suman acá mismo.

#include <Arduino.h>
#include <ArduinoJson.h>
#include <Arduino_GFX_Library.h>
#include <WebSocketsClient.h>
#include <WiFi.h>

#include "config.h"
#include "face.h"

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Falta include/secrets.h: copiá include/secrets.example.h como secrets.h y completalo"
#endif

// ---- pantalla: bus SPI + controlador + lienzo en memoria (dibuja sin parpadeos)
Arduino_DataBus *bus = new Arduino_ESP32SPI(PIN_LCD_DC, PIN_LCD_CS, PIN_LCD_SCK, PIN_LCD_MOSI, GFX_NOT_DEFINED);
Arduino_GFX *panel = new Arduino_ST7789(bus, PIN_LCD_RST, 1 /* apaisada */, false /* IPS, como el ejemplo oficial */, 172, 320,
                                        LCD_COL_OFFSET, 0, LCD_COL_OFFSET, 0);
Arduino_Canvas *canvas = new Arduino_Canvas(320, 172, panel);

Face face;
WebSocketsClient ws;
bool wsConnected = false;
uint32_t lastPing = 0;

void sendJson(JsonDocument &doc) {
  String out;
  serializeJson(doc, out);
  ws.sendTXT(out);
}

// Mensajes del servidor (ver protocolo en src/ws/robotSocket.js del backend)
void onServerMessage(const char *payload, size_t length) {
  JsonDocument msg;
  if (deserializeJson(msg, payload, length)) return;
  const char *type = msg["type"] | "";

  if (!strcmp(type, "welcome")) {
    face.showText("Conectado", 2000);
  } else if (!strcmp(type, "appearance")) {
    if (msg["eyeColor"].is<const char *>()) face.setColor(Face::parseColor(msg["eyeColor"]));
    face.setTerror(String(msg["faceStyle"] | "tierno") == "terror");
  } else if (!strcmp(type, "emotion")) {
    face.setEmotion(msg["emotion"] | "neutral");
  } else if (!strcmp(type, "reply")) {
    face.setEmotion(msg["emotion"] | "neutral");
    // hasta tener parlante, muestra el comienzo de lo que dice
    face.showText(String(msg["text"] | ""), 5000);
  } else if (!strcmp(type, "gesture")) {
    Serial.printf("[gesto] %s (servos: etapa 4)\n", (const char *)(msg["gesture"] | ""));
  } else if (!strcmp(type, "action")) {
    Serial.printf("[acción] %s\n", (const char *)(msg["action"] | ""));
  } else if (!strcmp(type, "error")) {
    Serial.printf("[servidor] error: %s\n", (const char *)(msg["message"] | ""));
  }
}

void onWsEvent(WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED: {
      wsConnected = true;
      Serial.println("[ws] conectado");
      JsonDocument hello;
      hello["type"] = "hello";
      hello["firmware"] = FIRMWARE_VERSION;
      sendJson(hello);
      break;
    }
    case WStype_DISCONNECTED:
      if (wsConnected) face.showText("Sin conexion con el servidor...", 4000);
      wsConnected = false;
      Serial.println("[ws] desconectado");
      break;
    case WStype_TEXT:
      onServerMessage((const char *)payload, length);
      break;
    default:
      break;
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.printf("\nRobi firmware %s\n", FIRMWARE_VERSION);

  if (PIN_LCD_BL >= 0) {
    pinMode(PIN_LCD_BL, OUTPUT);
    digitalWrite(PIN_LCD_BL, HIGH);
  }
  if (!canvas->begin()) Serial.println("[pantalla] no arrancó: revisar pines en include/config.h");
  canvas->fillScreen(0x0000);
  canvas->flush();

  face.begin(canvas);
  face.showText("Conectando al WiFi...", 15000);
  face.update(millis());
  canvas->flush();

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  String path = String("/ws/robot?deviceId=") + ROBI_DEVICE + "&token=" + ROBI_TOKEN;
  ws.beginSSL(ROBI_HOST, ROBI_PORT, path.c_str());
  ws.onEvent(onWsEvent);
  ws.setReconnectInterval(3000);
  ws.enableHeartbeat(15000, 5000, 2);  // detecta conexiones caídas
}

void loop() {
  static bool wifiShown = false;
  uint32_t now = millis();

  if (WiFi.status() == WL_CONNECTED) {
    if (!wifiShown) {
      wifiShown = true;
      Serial.printf("[wifi] conectado, IP %s\n", WiFi.localIP().toString().c_str());
      face.showText("WiFi OK, buscando al servidor...", 4000);
    }
    ws.loop();
  } else if (wifiShown) {
    wifiShown = false;
    face.showText("Se cayo el WiFi...", 4000);
  }

  // Aunque no haya conexión, la cara sigue viva (parpadea, vuelve a neutral)
  if (face.update(now)) canvas->flush();
  delay(5);
}
