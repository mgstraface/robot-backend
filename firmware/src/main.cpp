// Robi — firmware etapa 1: pantalla + WiFi + conexión con el servidor.
// Muestra la cara, recibe emociones/apariencia/respuestas del servidor y las dibuja.
// Etapas siguientes (táctiles, IMU, servos, audio) se suman acá mismo.

#include <Arduino.h>
#include <ArduinoJson.h>
#include <Arduino_GFX_Library.h>
#include <WebSocketsClient.h>
#include <HTTPUpdate.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiMulti.h>
#include <Wire.h>
#include <esp_system.h>

#include "ca.h"
#include "config.h"
#include "face.h"
#include "touch.h"
#include "servos.h"
#include "ui.h"
#include "wifiportal.h"

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

// Pantalla girada 180°: se invierte el lienzo (el último píxel pasa a ser el primero), se manda y se
// vuelve a dejar como estaba. Más seguro que pedirle el giro al chip de la pantalla.
bool pantallaGirada = false;
static void flip180(uint16_t *fb, int n) {
  for (int i = 0, j = n - 1; i < j; i++, j--) {
    uint16_t t = fb[i];
    fb[i] = fb[j];
    fb[j] = t;
  }
}
void flushScreen() {
  uint16_t *fb = canvas->getFramebuffer();
  if (pantallaGirada && fb) {
    flip180(fb, 320 * 172);
    canvas->flush();
    flip180(fb, 320 * 172);
  } else {
    canvas->flush();
  }
}

Face face;
Servos servos;
Touch touch;
UI ui;
WebSocketsClient ws;
WiFiMulti wifiMulti;  // varias redes: se conecta a la que encuentre
bool wsConnected = false;
int otaPending = 0;      // build nuevo que hay que bajar (0 = nada)
int otaFailedBuild = 0;  // si falló, no reintenta ese mismo hasta reiniciar
String otaStatus;        // resultado para avisarle al servidor cuando vuelva a conectar
bool noWifiKnown = false;
bool wifiShownEver = false;
uint32_t wifiLostAt = 0;  // desde cuándo no hay WiFi (para abrir el modo configuración)
// WiFi y servidor (ver loadCredentials)
String wifiSsid[3], wifiPass[3];
String robiHost, robiDevice, robiToken;
int robiPort = 443;
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
  Serial.printf("[servidor] %s %s\n", type, (const char *)(msg["emotion"] | ""));

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
    servos.gesture(msg["gesture"] | "");
  } else if (!strcmp(type, "action")) {
    face.playAction(String(msg["action"] | ""), String(msg["weather"] | ""));
  } else if (!strcmp(type, "test")) {
    String what = msg["what"] | "";
    if (what == "reiniciar") ESP.restart();
    if (what == "servos") servos.gesture("negar");
    if (what == "pantalla") {
      face.setEmotion("feliz");
      face.showText("Prueba de pantalla", 3000);
    }
  } else if (!strcmp(type, "calibration")) {
    servos.setCalibration(msg["servos"]);
  } else if (!strcmp(type, "servo")) {
    servos.moveRaw(msg["servo"] | "", msg["angle"] | 90);
  } else if (!strcmp(type, "servo_stop")) {
    servos.stop();
  } else if (!strcmp(type, "ota")) {
    int build = msg["build"] | 0;
    if (build > FIRMWARE_BUILD && build != otaFailedBuild) otaPending = build;
  } else if (!strcmp(type, "display")) {
    bool girada = msg["girada"] | false;
    Preferences p;
    p.begin("robi", false);
    if (p.getBool("girada", false) != girada) p.putBool("girada", girada);
    p.end();
    pantallaGirada = girada;
    touch.setFlipped(girada);
    face.invalidate();
    flushScreen();
  } else if (!strcmp(type, "talking")) {
    face.setTalking(msg["on"] | false);
  } else if (!strcmp(type, "cocina") || !strcmp(type, "recetas")) {
    ui.onServer(msg);
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
  st["build"] = FIRMWARE_BUILD;
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
      ui.setOnline(true);
      Serial.println("[ws] conectado");
      JsonDocument hello;
      hello["type"] = "hello";
      hello["firmware"] = FIRMWARE_VERSION;
      hello["build"] = FIRMWARE_BUILD;
      sendJson(hello);
      if (otaStatus.length()) {
        JsonDocument os;
        os["type"] = "ota_status";
        os["estado"] = "error";
        os["detalle"] = otaStatus;
        sendJson(os);
        otaStatus = "";
      }
      sendStatus();
      break;
    }
    case WStype_DISCONNECTED:
      if (wsConnected) face.showText("Sin conexion con el servidor...", 4000);
      wsConnected = false;
      ui.setOnline(false);
      Serial.println("[ws] desconectado");
      break;
    case WStype_ERROR:
      Serial.printf("[ws] error: %.*s\n", (int)length, (const char *)payload);
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
  Serial.printf("[wifi] tengo guardado: \"%s\"\n", wifiSsid[0].c_str());
  face.showText("No encuentro el WiFi (en 40 s: modo config)", 5000);
}

// ---- WiFi y datos del servidor: vienen de secrets.h al cargar por cable y quedan guardados en la
// memoria de la placa, así las actualizaciones por WiFi (que se compilan sin secrets.h) los conservan.

void loadCredentials() {
  Preferences p;
  p.begin("robi-cred", false);
#ifndef ROBI_SIN_SECRETOS
  // compilado en la compu con secrets.h de verdad: se guarda lo que trae
  p.putString("ssid0", WIFI_SSID);
  p.putString("pass0", WIFI_PASSWORD);
#ifdef WIFI_SSID_2
  p.putString("ssid1", WIFI_SSID_2);
  p.putString("pass1", WIFI_PASSWORD_2);
#else
  p.remove("ssid1");
#endif
#ifdef WIFI_SSID_3
  p.putString("ssid2", WIFI_SSID_3);
  p.putString("pass2", WIFI_PASSWORD_3);
#else
  p.remove("ssid2");
#endif
  p.putString("host", ROBI_HOST);
  p.putInt("port", ROBI_PORT);
  p.putString("device", ROBI_DEVICE);
  p.putString("token", ROBI_TOKEN);
#endif
  for (int i = 0; i < 3; i++) {
    wifiSsid[i] = p.getString(("ssid" + String(i)).c_str(), "");
    wifiPass[i] = p.getString(("pass" + String(i)).c_str(), "");
  }
  robiHost = p.getString("host", "robot.malestraface.com");
  robiPort = p.getInt("port", 443);
  robiDevice = p.getString("device", "robot-1");
  robiToken = p.getString("token", "");
  p.end();
  if (!wifiSsid[0].length()) Serial.println("[config] no tengo WiFi guardado: cargame una vez por cable con secrets.h");
}

// ---- actualización por WiFi: baja el firmware nuevo del servidor, lo graba y reinicia
static void otaScreen(const String &title, int pct) {
  canvas->fillScreen(0x0000);
  canvas->setTextColor(0xFFFF);
  canvas->setTextSize(2);
  canvas->setCursor((320 - title.length() * 12) / 2, 50);
  canvas->print(title);
  if (pct >= 0) {
    canvas->drawRoundRect(40, 90, 240, 18, 6, face.color());
    canvas->fillRoundRect(43, 93, (234 * pct) / 100, 12, 4, face.color());
    String p = String(pct) + "%";
    canvas->setCursor((320 - p.length() * 12) / 2, 120);
    canvas->print(p);
  }
  flushScreen();
}

void doOta(int build) {
  Serial.printf("[ota] actualizando a la compilacion %d\n", build);
  ws.disconnect();
  otaScreen("Actualizando...", 0);
  WiFiClientSecure client;
  client.setCACert(ROBI_CA);
  httpUpdate.rebootOnUpdate(false);
  static int lastPct = -1;
  lastPct = -1;
  httpUpdate.onProgress([](int cur, int total) {
    int pct = total > 0 ? (int)((int64_t)cur * 100 / total) : 0;
    if (pct != lastPct) {
      lastPct = pct;
      otaScreen("Actualizando...", pct);
    }
  });
  String url = "https://" + robiHost + "/api/firmware/robi.bin?token=" + robiToken;
  t_httpUpdate_return r = httpUpdate.update(client, url);
  if (r == HTTP_UPDATE_OK) {
    otaScreen("Listo! Reiniciando", -1);
    delay(1000);
    ESP.restart();
  }
  otaFailedBuild = build;
  otaStatus = httpUpdate.getLastErrorString();
  Serial.printf("[ota] fallo: %s\n", otaStatus.c_str());
  face.showText("No pude actualizar", 5000);
  face.invalidate();
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.printf("\nRobi firmware %s\n", FIRMWARE_VERSION);

  if (!canvas->begin(40000000)) Serial.println("[pantalla] no arrancó: revisar pines en include/config.h");
  jd9853Init();
  // apaisada (320x172); 3 = dada vuelta, si la placa está montada al revés (se guarda)
  {
    Preferences p;
    p.begin("robi", true);
    bool girada = p.getBool("girada", false);
    p.end();
    panel->setRotation(1);
    pantallaGirada = girada;
    touch.setFlipped(girada);
  }
  canvas->fillScreen(0x0000);
  flushScreen();

  face.begin(canvas);
  servos.begin();
  ui.begin(canvas, &face, sendJson);  // también prende la luz de fondo (con el brillo guardado)
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  touch.begin();
  face.showText("Conectando al WiFi...", 15000);
  face.update(millis());
  flushScreen();

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  loadCredentials();
  int known = 0;
  for (int i = 0; i < 3; i++)
    if (wifiSsid[i].length()) {
      wifiMulti.addAP(wifiSsid[i].c_str(), wifiPass[i].c_str());
      known++;
    }
  // las que se cargaron desde el celu (modo configuración)
  {
    String ps[3], pp[3];
    int n = WifiPortal::saved(ps, pp, 3);
    for (int i = 0; i < n; i++) {
      wifiMulti.addAP(ps[i].c_str(), pp[i].c_str());
      known++;
    }
  }
  noWifiKnown = known == 0;
  wifiMulti.run();

  String path = "/ws/robot?deviceId=" + robiDevice + "&token=" + robiToken;
  ws.beginSSL(robiHost.c_str(), robiPort, path.c_str());
  ws.onEvent(onWsEvent);
  ws.setReconnectInterval(3000);
  ws.enableHeartbeat(15000, 5000, 2);  // detecta conexiones caídas
}

void loop() {
  static bool wifiShown = false;
  uint32_t now = millis();

  // modo configuración del WiFi: mientras está, no hace otra cosa
  if (WifiPortal::active()) {
    WifiPortal::loop();
    // mantener apretada la pantalla: salir sin configurar (reinicia y vuelve a la cara)
    struct Salir : TouchHandler {
      void onTap(int, int) override {}
      void onTripleTap() override {}
      void onSwipe(Swipe) override {}
      void onLongPress() override { ESP.restart(); }
    } static salir;
    touch.poll(now, salir);
    delay(2);
    return;
  }
  if (ui.takeWifiSetup()) {
    ws.disconnect();
    WifiPortal::start(canvas, face.color());
    return;
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiLostAt = 0;
    if (!wifiShown) {
      wifiShown = true;
      wifiShownEver = true;
      Serial.printf("[wifi] conectado a %s, IP %s\n", WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
      face.showText("WiFi OK, buscando al servidor...", 4000);
      configTzTime("<-03>3", "pool.ntp.org", "time.google.com");  // hora de Argentina
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
    if (!wifiLostAt) wifiLostAt = now ? now : 1;
    // sin ninguna red conocida a la vista: modo configuración (al arrancar a los 40 s; si se cayó, a los 3 min)
    uint32_t espera = wifiShownEver ? 180000 : 40000;
    if (noWifiKnown || now - wifiLostAt > espera) {
      WifiPortal::start(canvas, face.color());
      return;
    }
    // busca de nuevo entre las redes conocidas cada 10 s
    static uint32_t lastTry = 0;
    if (now - lastTry > 10000) {
      lastTry = now;
      if (wifiMulti.run(3000) != WL_CONNECTED) listNetworks();
    }
  }

  // Aunque no haya conexión, la cara sigue viva (parpadea, vuelve a neutral)
  if (otaPending && WiFi.status() == WL_CONNECTED) {
    int b = otaPending;
    otaPending = 0;
    doOta(b);
    return;
  }
  servos.update(now);
  touch.poll(now, ui);
  face.setBadge(ui.badge(now));
  if (ui.showing()) {
    if (ui.update(now)) flushScreen();
  } else {
    ui.update(now);
    if (face.update(now)) flushScreen();
  }
  delay(5);
}
