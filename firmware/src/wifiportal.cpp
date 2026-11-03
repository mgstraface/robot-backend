#include "wifiportal.h"

#include <DNSServer.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WiFi.h>

namespace WifiPortal {

static const char *AP_NAME = "Robi-config";
static const uint32_t TIMEOUT_MS = 10 * 60 * 1000;  // si nadie lo configura, a los 10 min vuelve a probar

static bool on = false;
static uint32_t startedAt = 0;
static DNSServer dns;
static WebServer server(80);
static String options;  // <option> de las redes que ve

static String esc(const String &s) {
  String o;
  for (char c : s) {
    if (c == '<') o += "&lt;";
    else if (c == '>') o += "&gt;";
    else if (c == '&') o += "&amp;";
    else if (c == '"') o += "&quot;";
    else o += c;
  }
  return o;
}

static const char PAGE_HEAD[] PROGMEM = R"(<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Robi</title><style>
body{font-family:system-ui,sans-serif;background:#111;color:#eee;margin:0;padding:24px;max-width:420px}
h1{font-size:22px}label{display:block;margin:16px 0 6px;color:#aaa;font-size:14px}
select,input{width:100%;box-sizing:border-box;padding:12px;font-size:17px;border-radius:10px;border:1px solid #444;background:#222;color:#eee}
button{margin-top:22px;width:100%;padding:14px;font-size:18px;border:0;border-radius:10px;background:#5ef2ff;color:#111;font-weight:700}
p{color:#aaa;font-size:14px}</style></head><body>)";

static void handleRoot() {
  String h = FPSTR(PAGE_HEAD);
  h += F("<h1>&#128128; Configurar el WiFi de Robi</h1>"
         "<form method='POST' action='/guardar'>"
         "<label>Red WiFi</label><select name='s' onchange=\"document.getElementById('o').style.display=this.value?'none':'block'\">");
  h += options;
  h += F("<option value=''>Otra (escribirla)…</option></select>"
         "<input id='o' name='o' placeholder='Nombre de la red' style='display:none;margin-top:8px'>"
         "<label>Clave</label><input name='p' type='password' autocomplete='off'>"
         "<button>Guardar y conectar</button></form>"
         "<p>Tiene que ser una red de 2,4 GHz (no la que dice 5G).</p></body></html>");
  server.send(200, "text/html", h);
}

static void save(const String &ssid, const String &pass) {
  String s[3], p[3];
  int n = saved(s, p, 3);
  Preferences pr;
  pr.begin("robi-wifi", false);
  // la nueva primero; si ya estaba, se reemplaza
  pr.putString("s0", ssid);
  pr.putString("p0", pass);
  int k = 1;
  for (int i = 0; i < n && k < 3; i++) {
    if (s[i] == ssid) continue;
    pr.putString(("s" + String(k)).c_str(), s[i]);
    pr.putString(("p" + String(k)).c_str(), p[i]);
    k++;
  }
  for (; k < 3; k++) pr.remove(("s" + String(k)).c_str());
  pr.end();
}

static void handleSave() {
  String ssid = server.arg("s");
  if (!ssid.length()) ssid = server.arg("o");
  ssid.trim();
  if (!ssid.length()) {
    server.sendHeader("Location", "/");
    server.send(302);
    return;
  }
  save(ssid, server.arg("p"));
  String h = FPSTR(PAGE_HEAD);
  h += "<h1>&#9989; Listo</h1><p>Robi se reinicia y se conecta a <b>" + esc(ssid) +
       "</b>. Ya podés volver al WiFi de siempre en el celu.</p></body></html>";
  server.send(200, "text/html", h);
  Serial.printf("[portal] guardada la red \"%s\"; reinicio\n", ssid.c_str());
  delay(1500);
  ESP.restart();
}

static void handleOther() {
  // cualquier página (incluida la que usa el celu para detectar el portal) lleva al formulario
  server.sendHeader("Location", "http://192.168.4.1/");
  server.send(302);
}

static void screen(Arduino_Canvas *c, uint16_t color) {
  c->fillScreen(0x0000);
  c->setTextColor(color);
  c->setTextSize(2);
  c->setCursor(16, 14);
  c->print("Configurar WiFi");
  c->setTextColor(0xFFFF);
  c->setCursor(16, 50);
  c->print("1. En el celu, conectate");
  c->setCursor(16, 72);
  c->print("   al WiFi: ");
  c->setTextColor(color);
  c->print(AP_NAME);
  c->setTextColor(0xFFFF);
  c->setCursor(16, 102);
  c->print("2. Se abre una pagina:");
  c->setCursor(16, 124);
  c->print("   elegi tu red y la clave");
  c->setTextSize(1);
  c->setTextColor(0x9CD3);
  c->setCursor(16, 154);
  c->print("Si no se abre sola, entra a 192.168.4.1");
  c->flush();
}

void start(Arduino_Canvas *canvas, uint16_t color) {
  if (on) return;
  Serial.println("[portal] modo configuracion: red Robi-config");
  WiFi.disconnect();
  WiFi.mode(WIFI_AP_STA);
  // las redes que ve, para elegirla de una lista (sin repetir)
  int n = WiFi.scanNetworks();
  options = "";
  String seen = "|";
  for (int i = 0; i < n; i++) {
    String s = WiFi.SSID(i);
    if (!s.length() || seen.indexOf("|" + s + "|") >= 0) continue;
    seen += s + "|";
    options += "<option value=\"" + esc(s) + "\">" + esc(s) + "</option>";
  }
  WiFi.softAP(AP_NAME);
  dns.start(53, "*", WiFi.softAPIP());
  server.on("/", HTTP_GET, handleRoot);
  server.on("/guardar", HTTP_POST, handleSave);
  server.onNotFound(handleOther);
  server.begin();
  on = true;
  startedAt = millis();
  screen(canvas, color);
}

bool active() { return on; }

void loop() {
  if (!on) return;
  dns.processNextRequest();
  server.handleClient();
  if (millis() - startedAt > TIMEOUT_MS) {
    Serial.println("[portal] nadie lo configuro: reinicio para volver a buscar las redes");
    ESP.restart();
  }
}

int saved(String *ssid, String *pass, int max) {
  Preferences pr;
  pr.begin("robi-wifi", true);
  int n = 0;
  for (int i = 0; i < 3 && n < max; i++) {
    String s = pr.getString(("s" + String(i)).c_str(), "");
    if (!s.length()) continue;
    ssid[n] = s;
    pass[n] = pr.getString(("p" + String(i)).c_str(), "");
    n++;
  }
  pr.end();
  return n;
}

}  // namespace WifiPortal
