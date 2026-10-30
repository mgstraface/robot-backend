#pragma once
// Pines de la placa (verificados con el esquema de Waveshare) y de lo que le conectamos.

// ---- Pantalla (JD9853, 172x320, SPI). Verificado con el esquema oficial de Waveshare.
#define PIN_LCD_SCK   38
#define PIN_LCD_MOSI  39
#define PIN_LCD_CS    21
#define PIN_LCD_DC    45
#define PIN_LCD_RST   40
#define PIN_LCD_BL    46   // luz de fondo
#define LCD_COL_OFFSET 34

// ---- Pantalla táctil AXS5106L (I2C, dirección 0x63). El MPU6050 va en el mismo bus.
#define PIN_I2C_SDA   42
#define PIN_I2C_SCL   41
#define PIN_TP_INT    48
#define PIN_TP_RST    47

// ---- Batería (divisor x3 en el pin 12) y botón BOOT
#define PIN_BAT_ADC   12
#define PIN_BOOT      0

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

#define FIRMWARE_VERSION "0.1.1"
