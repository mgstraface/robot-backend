// Pruebas de hardware de Robi sobre la protoboard. Se maneja con letras desde el Monitor Serie (115200).
// Pines iguales a firmware/include/config.h. La pantalla NO se usa acá (queda apagada).
#include <Arduino.h>
#include <Wire.h>
#include <driver/i2s.h>
#include <math.h>

// ---- pines (ver config.h)
static const int PIN_SERVO[4] = {1, 2, 3, 4};  // 0=NO(pan) 1=SÍ(tilt) 2=brazo izq 3=brazo der
static const char *NOMBRE_SERVO[4] = {"NO (GPIO1)", "SI (GPIO2)", "brazo izq (GPIO3)", "brazo der (GPIO4)"};
static const int PIN_BCLK = 5, PIN_WS = 6, PIN_MIC = 7, PIN_AMP = 8;
static const int PIN_TOUCH[3] = {9, 10, 11};  // cabeza, panza, espalda
static const char *NOMBRE_TOUCH[3] = {"cabeza(9)", "panza(10)", "espalda(11)"};
static const int PIN_SDA = 42, PIN_SCL = 41;

// ---- servos (misma configuración PWM que el firmware: 50 Hz, 14 bits, pulso 500..2400 us)
static const int CH0 = 2, FREQ = 50, BITS = 14;
static float angServo[4] = {90, 90, 90, 90};
static bool servoOn[4] = {false, false, false, false};

static void servoEscribir(int i, float ang) {
  if (ang < 0) ang = 0;
  if (ang > 180) ang = 180;
  if (!servoOn[i]) {
    ledcSetup(CH0 + i, FREQ, BITS);
    ledcAttachPin(PIN_SERVO[i], CH0 + i);
    servoOn[i] = true;
  }
  float us = 500 + (2400 - 500) * ang / 180.0f;
  ledcWrite(CH0 + i, (uint32_t)(us / 20000.0f * ((1 << BITS) - 1)));
  angServo[i] = ang;
}
static void servoIr(int i, float destino, int msPorGrado = 15) {  // movimiento lento
  float a = angServo[i];
  int paso = destino > a ? 1 : -1;
  while ((int)a != (int)destino) {
    a += paso;
    servoEscribir(i, a);
    delay(msPorGrado);
  }
  servoEscribir(i, destino);
}
static void servoPrueba(int i) {
  Serial.printf("Servo %s: 90 -> 70 -> 110 -> 90\n", NOMBRE_SERVO[i]);
  servoIr(i, 90, 20);
  delay(300);
  servoIr(i, 70);
  delay(300);
  servoIr(i, 110);
  delay(300);
  servoIr(i, 90);
  Serial.println("Listo. (Si no se movio: revisa 5V, GND y el cable naranja a su GPIO.)");
}

// ---- audio: un solo puerto I2S (mic entra por GPIO7, ampli sale por GPIO8, mismos BCLK/WS)
static bool i2sOk = false;
static const int SR = 16000;
static void i2sIniciar() {
  if (i2sOk) return;
  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX | I2S_MODE_RX);
  cfg.sample_rate = SR;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;  // INMP441 con L/R a GND sale por el canal izquierdo
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  cfg.dma_buf_count = 8;
  cfg.dma_buf_len = 256;
  cfg.tx_desc_auto_clear = true;
  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = PIN_BCLK;
  pins.ws_io_num = PIN_WS;
  pins.data_out_num = PIN_AMP;
  pins.data_in_num = PIN_MIC;
  if (i2s_driver_install(I2S_NUM_0, &cfg, 0, NULL) != ESP_OK || i2s_set_pin(I2S_NUM_0, &pins) != ESP_OK) {
    Serial.println("ERROR: no arranco el I2S");
    return;
  }
  i2sOk = true;
}
static void beep(float hz, int ms) {
  i2sIniciar();
  if (!i2sOk) return;
  const int N = 256;
  static int32_t buf[N];
  int total = SR * ms / 1000;
  float fase = 0, d = 2 * M_PI * hz / SR;
  for (int hecho = 0; hecho < total; hecho += N) {
    for (int k = 0; k < N; k++) {
      buf[k] = (int32_t)(sinf(fase) * 3000000.0f) << 8;  // volumen bajo
      fase += d;
      if (fase > 2 * M_PI) fase -= 2 * M_PI;
    }
    size_t escritos;
    i2s_write(I2S_NUM_0, buf, sizeof(buf), &escritos, portMAX_DELAY);
  }
}
static bool tecla() {
  if (Serial.available()) {
    while (Serial.available()) Serial.read();
    return true;
  }
  return false;
}
static void micMedidor() {
  i2sIniciar();
  if (!i2sOk) return;
  Serial.println("Medidor del microfono. Habla o aplaude. Cualquier tecla = salir.");
  const int N = 256;
  static int32_t buf[N];
  uint32_t ultimo = 0;
  while (!tecla()) {
    size_t leidos = 0;
    i2s_read(I2S_NUM_0, buf, sizeof(buf), &leidos, 100 / portTICK_PERIOD_MS);
    int n = leidos / 4;
    if (n == 0) continue;
    double suma = 0;
    int64_t media = 0;
    for (int k = 0; k < n; k++) media += (buf[k] >> 8);
    media /= n;
    for (int k = 0; k < n; k++) {
      double v = (double)((buf[k] >> 8) - media);
      suma += v * v;
    }
    float rms = sqrt(suma / n);
    if (millis() - ultimo > 120) {
      ultimo = millis();
      int barra = (int)(log10f(rms + 1) * 8);  // escala logaritmica
      if (barra > 60) barra = 60;
      Serial.printf("%8.0f |", rms);
      for (int k = 0; k < barra; k++) Serial.print('#');
      Serial.println();
    }
  }
  Serial.println("Fin. En silencio deberia dar un numero bajo y fijo; si es 0 siempre, mira SD/WS/SCK y 3V3.");
}

// ---- I2C: escaneo + lectura del MPU6050
static void i2cPrueba() {
  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(100000);
  Serial.println("Escaneando I2C (SDA=42, SCL=41)...");
  int hallados = 0;
  for (uint8_t a = 1; a < 127; a++) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) {
      Serial.printf("  encontrado 0x%02X%s\n", a, a == 0x68 || a == 0x69 ? "  <- MPU6050" : (a == 0x63 ? "  <- tactil de la pantalla" : ""));
      hallados++;
    }
  }
  if (!hallados) Serial.println("  nada. Revisa 3V3, GND, SDA y SCL (no cruzados).");
  Wire.beginTransmission(0x68);
  Wire.write(0x6B);
  Wire.write(0);  // despertar
  if (Wire.endTransmission() != 0) {
    Serial.println("No responde el MPU6050 en 0x68.");
    return;
  }
  Wire.beginTransmission(0x68);
  Wire.write(0x75);
  Wire.endTransmission(false);
  Wire.requestFrom(0x68, 1);
  if (Wire.available()) Serial.printf("WHO_AM_I = 0x%02X (0x68 es lo normal; algunos clones dan otro)\n", Wire.read());
  Serial.println("Aceleracion en g, 10 lecturas (inclina el modulo: la gravedad = ~1.0 en un eje):");
  for (int n = 0; n < 10; n++) {
    Wire.beginTransmission(0x68);
    Wire.write(0x3B);
    Wire.endTransmission(false);
    Wire.requestFrom(0x68, 6);
    if (Wire.available() >= 6) {
      int16_t x = (Wire.read() << 8) | Wire.read();
      int16_t y = (Wire.read() << 8) | Wire.read();
      int16_t z = (Wire.read() << 8) | Wire.read();
      Serial.printf("  x=%6.2f  y=%6.2f  z=%6.2f\n", x / 16384.0f, y / 16384.0f, z / 16384.0f);
    }
    delay(300);
  }
}

// ---- touch (TTP223: salida en alto cuando lo tocas)
static void touchPrueba() {
  for (int i = 0; i < 3; i++) pinMode(PIN_TOUCH[i], INPUT_PULLDOWN);
  Serial.println("Toca cada sensor. Cualquier tecla = salir.");
  int ant[3] = {-1, -1, -1};
  while (!tecla()) {
    for (int i = 0; i < 3; i++) {
      int v = digitalRead(PIN_TOUCH[i]);
      if (v != ant[i]) {
        ant[i] = v;
        Serial.printf("  %s: %s\n", NOMBRE_TOUCH[i], v ? "TOCADO" : "suelto");
      }
    }
    delay(20);
  }
}

static void ayuda() {
  Serial.println();
  Serial.println("=== Pruebas de Robi ===");
  Serial.println(" 1..4  mover servo (1=NO 2=SI 3=brazo izq 4=brazo der): 90 -> 70 -> 110 -> 90");
  Serial.println(" c     llevar los servos conectados a 90 (centro)");
  Serial.println(" b     beep por el parlante");
  Serial.println(" m     medidor del microfono");
  Serial.println(" i     escaneo I2C + MPU6050");
  Serial.println(" t     sensores touch");
  Serial.println(" h     esta ayuda");
  Serial.println("Servos: probalos DE A UNO. Enchufa/desenchufa con todo apagado.");
}

void setup() {
  Serial.begin(115200);
  uint32_t t0 = millis();
  while (!Serial && millis() - t0 < 3000) delay(10);
  ayuda();
}

void loop() {
  if (!Serial.available()) return;
  char ch = Serial.read();
  if (ch == '\n' || ch == '\r' || ch == ' ') return;
  switch (ch) {
    case '1': case '2': case '3': case '4': servoPrueba(ch - '1'); break;
    case 'c':
      for (int i = 0; i < 4; i++)
        if (servoOn[i]) servoIr(i, 90, 15);
      Serial.println("Centrados (los que ya estaban activos).");
      break;
    case 'b': Serial.println("Beep..."); beep(660, 400); delay(100); beep(880, 400); Serial.println("Listo."); break;
    case 'm': micMedidor(); break;
    case 'i': i2cPrueba(); break;
    case 't': touchPrueba(); break;
    default: ayuda();
  }
}
