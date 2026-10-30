#pragma once
// Pines de la placa y de lo que le conectamos. Lo marcado "VERIFICAR" sale de la wiki de Waveshare
// o es una suposición: confirmarlo con el ejemplo oficial (01_gfx_helloworld) y el esquema.

// ---- Pantalla (JD9853, 172x320, SPI). Fuente: wiki Waveshare, demo 01_gfx_helloworld
#define PIN_LCD_SCK   38
#define PIN_LCD_MOSI  39
#define PIN_LCD_CS    21
#define PIN_LCD_DC    45
#define PIN_LCD_RST   47
// VERIFICAR: la wiki no dice el pin de la luz de fondo. Si la pantalla queda negra, buscá "GFX_BL"
// en el ejemplo oficial y poné ese número acá (-1 = no tocarla).
#define PIN_LCD_BL    46
#define LCD_COL_OFFSET 34

// ---- Pantalla táctil AXS5106L e I2C (lo comparte el MPU6050). VERIFICAR con el esquema.
#define PIN_I2C_SDA   42
#define PIN_I2C_SCL   41

// ---- Lo que conectamos nosotros (etapas 2 a 5). Plan preliminar, VERIFICAR antes de soldar.
#define PIN_SERVO_PAN      1   // cuello: giro (no)
#define PIN_SERVO_TILT     2   // cuello: cabeceo (sí)
#define PIN_SERVO_ARM_L    3
#define PIN_SERVO_ARM_R    4
#define PIN_I2S_BCLK       5
#define PIN_I2S_WS         6
#define PIN_I2S_MIC_DIN    7   // INMP441 SD
#define PIN_I2S_AMP_DOUT   8   // MAX98357A DIN
#define PIN_TOUCH_CABEZA   9   // TTP223
#define PIN_TOUCH_PANZA    10
#define PIN_TOUCH_ESPALDA  11

#define FIRMWARE_VERSION "0.1.0"
