# Pruebas de hardware (protoboard)

Programa aparte del firmware del robot: sirve para comprobar, de a una, cada pieza conectada en la protoboard.
Pines: los mismos de `firmware/include/config.h`.

1. Abrí esta carpeta (`firmware/pruebas/`) en VS Code con PlatformIO y tocá **Upload**.
2. Abrí el **Monitor Serie** (115200). Si no sube: mantené apretado BOOT, enchufá el USB, soltá y reintentá.
3. Escribí una letra y Enter:

| Letra | Prueba | Qué tiene que pasar |
|---|---|---|
| `1`–`4` | Servo NO / SÍ / brazo izq. / brazo der. | Se mueve 90 → 70 → 110 → 90 |
| `c` | Centrar servos | Vuelven a 90° |
| `b` | Parlante | Dos pitidos (grave y agudo) |
| `m` | Micrófono | Barra que sube cuando hablás o aplaudís |
| `i` | I2C + MPU6050 | Aparece 0x68 (MPU) y 0x63 (táctil de la pantalla); aceleración ≈ 1,0 g en un eje |
| `t` | Touch | Dice TOCADO / suelto para cada sensor |

Servos: de a uno. Con USB de la compu un solo servo por vez.
Este programa NO enciende la pantalla (queda negra) ni usa WiFi.
