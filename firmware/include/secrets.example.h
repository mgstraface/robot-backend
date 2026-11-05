#pragma once
// Copiá este archivo como "secrets.h" (en esta misma carpeta) y completalo.
// secrets.h no se sube a GitHub.

// Redes WiFi (de 2,4 GHz). Se conecta sola a la que encuentre.
#define WIFI_SSID     "nombre-de-tu-wifi"
#define WIFI_PASSWORD "clave-de-tu-wifi"

// Opcionales: más redes (casa, oficina...). Borrá las "//" del principio para usarlas.
// #define WIFI_SSID_2     "wifi-de-casa"
// #define WIFI_PASSWORD_2 "clave-de-casa"
// #define WIFI_SSID_3     "otro-wifi"
// #define WIFI_PASSWORD_3 "otra-clave"

// Servidor de Robi
#define ROBI_HOST     "robot.malestraface.com"
#define ROBI_PORT     443
#define ROBI_DEVICE   "robot-1"
// El DEVICE_TOKEN del .env del VPS:  grep DEVICE_TOKEN /root/robot/robot-backend/.env
#define ROBI_TOKEN    "pegar-acá-el-device-token"
