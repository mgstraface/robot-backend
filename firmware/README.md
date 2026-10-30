# Firmware de Robi

Placa: **Waveshare ESP32-S3-Touch-LCD-1.47**. Se programa con VS Code + PlatformIO.

## Etapa 1: la cara en la pantalla

1. En la compu: `git pull` en `robot-backend` y abrí **la carpeta `firmware/`** en VS Code
   (Archivo → Abrir carpeta). PlatformIO detecta el proyecto y baja lo que necesita (la primera vez tarda).
2. Copiá `include/secrets.example.h` como `include/secrets.h` y completá:
   - tu WiFi (nombre y clave; el ESP32 solo usa WiFi de 2,4 GHz)
   - el `ROBI_TOKEN`: en el VPS, `grep DEVICE_TOKEN /root/robot/robot-backend/.env`
3. Enchufá la placa por USB-C (cable de datos).
4. Barra azul de abajo → **flechita (Upload)**. Al terminar, la flechita con enchufe (**Monitor**) muestra los mensajes.

Debería aparecer la cara, "Conectando al WiFi…", y después "Conectado". Desde el panel, al tocar una expresión,
la cara del robot cambia.

### Si algo no anda

- **No sube ("No serial port" / "Failed to connect")**: mantené apretado **BOOT**, enchufá el USB, soltá y volvé a subir.
- **La pantalla queda negra pero el monitor dice "conectado"**: falta la luz de fondo. Buscá `GFX_BL` en el ejemplo oficial
  `01_gfx_helloworld` de Waveshare y poné ese número en `PIN_LCD_BL` (`include/config.h`).
- **Colores o imagen corrida**: probá `true` en el parámetro IPS de `main.cpp`, o revisar `LCD_COL_OFFSET`.

## Mapa de pines

En `include/config.h`. Los de la pantalla salen de la wiki oficial; los de servos, audio y táctiles son el plan
preliminar y se confirman con el esquema antes de soldar.

## Actualización por WiFi

Cada cambio en `main` se compila solo en GitHub y se publica en el release **firmware**. El servidor se lo ofrece a la placa cuando se conecta (y cada media hora): ella lo baja, muestra el progreso en la pantalla y se reinicia sola. También se puede forzar desde el panel: pestaña **Robot → Buscar actualización**.

Esas versiones se compilan **sin** `secrets.h`: la placa usa el WiFi y el token que guardó la última vez que la cargaste por cable. Si cambiás de WiFi o de token, cargala una vez por cable con el `secrets.h` nuevo.
