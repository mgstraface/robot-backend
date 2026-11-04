"""
Medidas del hardware (en mm). TODO lo que dependa de piezas reales está acá.

⚠ Las de la placa son estimadas a partir de las fotos de Waveshare ESP32-S3-Touch-LCD-1.47:
   cuando llegue, medila con calibre, corregí estos números y volvé a generar (python generar.py).
   Antes de imprimir los cuerpos, imprimí "prueba_encastre.stl" (10 minutos) para confirmar.
"""

# Holgura general entre piezas que encastran (por lado). 0.3 anda bien en la mayoría de las impresoras.
HOLGURA = 0.15  # medido con la pieza de prueba en la A1 mini (3 nov 2026)

# ---------------- Placa con pantalla (acostada: el lado largo es horizontal)
# Medidas oficiales de Waveshare (ESP32-S3-Touch-LCD-1.47), confirmadas 29/10
PLACA_ANCHO = 42.0  # x: lado largo del módulo, con su marco negro
PLACA_ALTO = 24.55  # z: lado corto
PLACA_PROF = 6.6  # y: marco + pantalla + plaqueta (sin contar los pines)
AGUJEROS_M2 = (39.0, 17.0)  # separación de los 4 agujeros M2 (largo, corto)
PINES_PROF = 16.0  # y: pines (4 mm) + conectores dupont enchufados (~14 mm) por detrás de la plaqueta
VISOR_ANCHO = 32.93  # zona visible de la pantalla (172×320 a 1,47")
VISOR_ALTO = 17.75  # centrada en el módulo (4,54 mm de borde arriba y abajo)
VISOR_DESPLAZ_X = 0.0  # si la pantalla no está centrada en el módulo, corregir acá
USB_ALTO = 7.5  # boca del USB-C (en el lado corto izquierdo, x negativo)
USB_ANCHO = 12.0
USB_Y = 6.5  # distancia del frente del módulo al centro del USB-C (va soldado atrás de la plaqueta, foto 29/10)

# ---------------- Imanes de neodimio (disco)
IMAN_D = 6.0
IMAN_H = 3.0

# ---------------- Servo MG90S
SERVO_LARGO = 22.8
SERVO_ANCHO = 12.2
SERVO_ALTO = 22.7  # hasta las orejas no, hasta la tapa del cuerpo
SERVO_OREJAS_LARGO = 32.3
SERVO_OREJAS_ALTO = 2.5
SERVO_OREJAS_Z = 15.9  # altura de las orejas desde la base del servo
SERVO_TORNILLOS = 27.8  # distancia entre agujeros de las orejas
SERVO_EJE_DESDE_PUNTA = 5.9  # el eje no está centrado: está a esta distancia de una punta
SERVO_ENGRANAJE_ALTO = 5.8  # lo que sobresale la torre del engranaje sobre el cuerpo

# Brazo de servo ("horn") de un solo brazo, el que viene con el MG90S
HORN_LARGO = 19.0
HORN_ANCHO_BASE = 6.5
HORN_ESPESOR = 2.0

# ---------------- Electrónica de la base
PARLANTE_D = 40.0
PARLANTE_PROF = 20.0
PILA_LARGO = 78.0  # portapilas 18650 simple
PILA_ANCHO = 21.0
PILA_ALTO = 20.0
ELEVADOR_LARGO = 37.0  # módulo step-up a 5 V
ELEVADOR_ANCHO = 18.0
INTERRUPTOR_ANCHO = 13.2  # interruptor basculante mini (tipo KCD11)
INTERRUPTOR_ALTO = 8.8
TORNILLO_M3_GUIA = 2.6  # agujero para que un M3 haga rosca en el plástico
TORNILLO_M3_PASO = 3.4
TORNILLO_M2_GUIA = 1.7
