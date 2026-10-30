// Robi — firmware etapa 1: pantalla + WiFi + conexión con el servidor.
// Muestra la cara, recibe emociones/apariencia/respuestas del servidor y las dibuja.
// Etapas siguientes (táctiles, IMU, servos, audio) se suman acá mismo.

#include <Arduino.h>
#include <ArduinoJson.h>
#include <Arduino_GFX_Library.h>
#include <WebSocketsClient.h>
#include <WiFi.h>
#include <WiFiMulti.h>
#include <esp_system.h>

#include "config.h"
#include "face.h"

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Falta include/secrets.h: copiá include/secrets.example.h como secrets.h y completalo"
#endif

// ---- pantalla: bus SPI + controlador + lienzo en memoria (dibuja sin parpadeos)
Arduino_DataBus *bus = new Arduino_ESP32SPI(PIN_LCD_DC, PIN_LCD_CS, PIN_LCD_SCK, PIN_LCD_MOSI, GFX_NOT_DEFINED);
// El chip es un JD9853: se maneja con el driver ST7789 de la librería, pero necesita su propia
// secuencia de arranque (la del ejemplo oficial de Waveshare); sin ella la pantalla queda negra.
Arduino_GFX *panel = new Arduino_ST7789(bus, PIN_LCD_RST, 0 /* vertical; se gira después */, false, 172, 320,
                                        LCD_COL_OFFSET, 0, LCD_COL_OFFSET, 0);
Arduino_Canvas *canvas = new Arduino_Canvas(320, 172, panel);

// Secuencia de arranque del JD9853 (lcd_reg_init() del ejemplo oficial de Waveshare)
static void jd9853Init() {
    static const uint8_t init_operations[] = {
    BEGIN_WRITE,
    WRITE_COMMAND_8, 0x11,  // 2: Out of sleep mode, no args, w/delay
    END_WRITE,
    DELAY, 120,

    BEGIN_WRITE,
    WRITE_C8_D16, 0xDF, 0x98, 0x53,
    WRITE_C8_D8, 0xB2, 0x23,

    WRITE_COMMAND_8, 0xB7,
    WRITE_BYTES, 4,
    0x00, 0x47, 0x00, 0x6F,

    WRITE_COMMAND_8, 0xBB,
    WRITE_BYTES, 6,
    0x1C, 0x1A, 0x55, 0x73, 0x63, 0xF0,

    WRITE_C8_D16, 0xC0, 0x44, 0xA4,
    WRITE_C8_D8, 0xC1, 0x16,

    WRITE_COMMAND_8, 0xC3,
    WRITE_BYTES, 8,
    0x7D, 0x07, 0x14, 0x06, 0xCF, 0x71, 0x72, 0x77,

    WRITE_COMMAND_8, 0xC4,
    WRITE_BYTES, 12,
    0x00, 0x00, 0xA0, 0x79, 0x0B, 0x0A, 0x16, 0x79, 0x0B, 0x0A, 0x16, 0x82,

    WRITE_COMMAND_8, 0xC8,
    WRITE_BYTES, 32,
    0x3F, 0x32, 0x29, 0x29, 0x27, 0x2B, 0x27, 0x28, 0x28, 0x26, 0x25, 0x17, 0x12, 0x0D, 0x04, 0x00, 0x3F, 0x32, 0x29, 0x29, 0x27, 0x2B, 0x27, 0x28, 0x28, 0x26, 0x25, 0x17, 0x12, 0x0D, 0x04, 0x00,

    WRITE_COMMAND_8, 0xD0,
    WRITE_BYTES, 5,
    0x04, 0x06, 0x6B, 0x0F, 0x00,

    WRITE_C8_D16, 0xD7, 0x00, 0x30,
    WRITE_C8_D8, 0xE6, 0x14,
    WRITE_C8_D8, 0xDE, 0x01,

    WRITE_COMMAND_8, 0xB7,
    WRITE_BYTES, 5,
    0x03, 0x13, 0xEF, 0x35, 0x35,

    WRITE_COMMAND_8, 0xC1,
    WRITE_BYTES, 3,
    0x14, 0x15, 0xC0,

    WRITE_C8_D16, 0xC2, 0x06, 0x3A,
    WRITE_C8_D16, 0xC4, 0x72, 0x12,
    WRITE_C8_D8, 0xBE, 0x00,
    WRITE_C8_D8, 0xDE, 0x02,

    WRITE_COMMAND_8, 0xE5,
    WRITE_BYTES, 3,
    0x00, 0x02, 0x00,

    WRITE_COMMAND_8, 0xE5,
    WRITE_BYTES, 3,
    0x01, 0x02, 0x00,

    WRITE_C8_D8, 0xDE, 0x00,
    WRITE_C8_D8, 0x35, 0x00,
    WRITE_C8_D8, 0x3A, 0x05,

    WRITE_COMMAND_8, 0x2A,
    WRITE_BYTES, 4,
    0x00, 0x22, 0x00, 0xCD,

    WRITE_COMMAND_8, 0x2B,
    WRITE_BYTES, 4,
    0x00, 0x00, 0x01, 0x3F,

    WRITE_C8_D8, 0xDE, 0x02,

    WRITE_COMMAND_8, 0xE5,
    WRITE_BYTES, 3,
    0x00, 0x02, 0x00,

    WRITE_C8_D8, 0xDE, 0x00,
    WRITE_C8_D8, 0x36, 0x00,
    WRITE_COMMAND_8, 0x21,
    END_WRITE,

    DELAY, 10,

    BEGIN_WRITE,
    WRITE_COMMAND_8, 0x29,  // 5: Main screen turn on, no args, w/delay
    END_WRITE

    };
    bus->batchOperation(init_operations, sizeof(init_operations));
}

Face face;
WebSocketsClient ws;
WiFiMulti wifiMulti;  // varias redes: se conecta a la que encuentre
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
  } else if (!strcmp(type, "test")) {
    String what = msg["what"] | "";
    if (what == "reiniciar") ESP.restart();
    if (what == "pantalla") {
      face.setEmotion("feliz");
      face.showText("Prueba de pantalla", 3000);
    }
  } else if (!strcmp(type, "calibration") || !strcmp(type, "servo") || !strcmp(type, "servo_stop")) {
    Serial.printf("[servos] %s (se conectan en la etapa 4)\n", type);
  } else if (!strcmp(type, "error")) {
    Serial.printf("[servidor] error: %s\n", (const char *)(msg["message"] | ""));
  }
}

const char *resetReason() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON: return "encendido";
    case ESP_RST_SW: return "reinicio pedido";
    case ESP_RST_PANIC: return "error (panic)";
    case ESP_RST_BROWNOUT: return "baja tension (brownout)";
    case ESP_RST_INT_WDT:
    case ESP_RST_TASK_WDT:
    case ESP_RST_WDT: return "watchdog";
    case ESP_RST_DEEPSLEEP: return "salio de deep sleep";
    default: return "otro";
  }
}

// Diagnóstico: el panel lo muestra en la pestaña Robot
void sendStatus() {
  JsonDocument st;
  st["type"] = "status";
  st["firmware"] = FIRMWARE_VERSION;
  st["uptime"] = millis() / 1000;
  st["resetReason"] = resetReason();
  st["rssi"] = WiFi.RSSI();
  st["heap"] = ESP.getFreeHeap();
  sendJson(st);
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
      sendStatus();
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

// Ayuda: si no encuentra ninguna red conocida, escribe las que ve (para copiar el nombre exacto)
void listNetworks() {
  static uint32_t lastList = 0;
  if (lastList && millis() - lastList < 60000) return;  // una vez por minuto
  lastList = millis();
  int n = WiFi.scanNetworks();
  Serial.printf("[wifi] no encuentro las redes de secrets.h. Veo %d redes:\n", n);
  for (int i = 0; i < n; i++) Serial.printf("   \"%s\"  (señal %d)\n", WiFi.SSID(i).c_str(), WiFi.RSSI(i));
  Serial.printf("[wifi] en secrets.h tengo: \"%s\"\n", WIFI_SSID);
  face.showText("No encuentro el WiFi", 5000);
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.printf("\nRobi firmware %s\n", FIRMWARE_VERSION);

  if (PIN_LCD_BL >= 0) {
    pinMode(PIN_LCD_BL, OUTPUT);
    digitalWrite(PIN_LCD_BL, HIGH);
  }
  if (!canvas->begin(40000000)) Serial.println("[pantalla] no arrancó: revisar pines en include/config.h");
  jd9853Init();
  panel->setRotation(1);  // apaisada: 320x172
  canvas->fillScreen(0x0000);
  canvas->flush();

  face.begin(canvas);
  face.showText("Conectando al WiFi...", 15000);
  face.update(millis());
  canvas->flush();

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  wifiMulti.addAP(WIFI_SSID, WIFI_PASSWORD);
#ifdef WIFI_SSID_2
  wifiMulti.addAP(WIFI_SSID_2, WIFI_PASSWORD_2);
#endif
#ifdef WIFI_SSID_3
  wifiMulti.addAP(WIFI_SSID_3, WIFI_PASSWORD_3);
#endif
  wifiMulti.run();

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
      Serial.printf("[wifi] conectado a %s, IP %s\n", WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
      face.showText("WiFi OK, buscando al servidor...", 4000);
    }
    ws.loop();
    if (wsConnected && now - lastPing > 30000) {
      lastPing = now;
      sendStatus();
    }
  } else {
    if (wifiShown) {
      wifiShown = false;
      face.showText("Se cayo el WiFi...", 4000);
    }
    // busca de nuevo entre las redes conocidas cada 10 s
    static uint32_t lastTry = 0;
    if (now - lastTry > 10000) {
      lastTry = now;
      if (wifiMulti.run(3000) != WL_CONNECTED) listNetworks();
    }
  }

  // Aunque no haya conexión, la cara sigue viva (parpadea, vuelve a neutral)
  if (face.update(now)) canvas->flush();
  delay(5);
}
