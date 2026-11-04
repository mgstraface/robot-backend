"""
El NÚCLEO: cartucho con la placa y la pantalla. Es el mismo para todos los cuerpos.

Se mete por atrás de la cabeza hasta que la cara del cartucho toca el marco de la ventana,
y lo sostienen dos imanes laterales (uno por lado). El USB-C queda alineado con una ranura
en el costado izquierdo de la cabeza, para cargar y programar sin sacarlo.

Coordenadas locales: frente del cartucho en y = 0 (mira a -y), centro en x = 0, z = 0.
"""
from medidas import *
from sdf import box, cylinder, subtract, union, intersect, translate

H = HOLGURA

# --- medidas derivadas del cartucho
FRENTE = 1.6  # espesor de la pared con la ventana
PARED_LADO = 3.8  # paredes laterales gruesas: ahí van los imanes
PARED_TB = 2.0  # techo y piso
HUECO_X = PLACA_ANCHO / 2 + H  # medio ancho interior
HUECO_Z = PLACA_ALTO / 2 + H
EXT_X = HUECO_X + PARED_LADO  # medio ancho exterior
EXT_Z = HUECO_Z + PARED_TB
PROF = round(FRENTE + PLACA_PROF + PINES_PROF + 4.5, 1)  # +4.5 para que doblen los cables
RADIO = 2.5

VENTANA_X = VISOR_ANCHO + 0.8
VENTANA_Z = VISOR_ALTO + 0.8
IMAN_Y = PROF - 8.0  # imanes cerca de atrás (lejos del USB)
USB_CENTRO_Y = FRENTE + USB_Y

# Conector hacia el cuerpo: sale por una ranura en la tapa trasera
CABLE_RANURA = (16.0, 7.0)


def nucleo():
    exterior = box((0, PROF / 2, 0), (2 * EXT_X, PROF, 2 * EXT_Z), RADIO)
    hueco = box((0, FRENTE + (PROF + 2) / 2, 0), (2 * HUECO_X, PROF + 2, 2 * HUECO_Z), 1.0)
    ventana = box((VISOR_DESPLAZ_X, 0, 0), (VENTANA_X, FRENTE * 4, VENTANA_Z), 1.6)
    bisel = box((VISOR_DESPLAZ_X, -0.2, 0), (VENTANA_X + 2.0, 1.0, VENTANA_Z + 2.0), 2.4)
    usb = box((-EXT_X, USB_CENTRO_Y, 0), (PARED_LADO * 3, USB_ALTO + 1.0, USB_ANCHO + 1.0), 1.5)
    imanes = union(
        cylinder((EXT_X - (IMAN_H + 0.3) / 2 + 0.01, IMAN_Y, 0), (IMAN_D + 0.3) / 2, IMAN_H + 0.3, 'x'),
        cylinder((-EXT_X + (IMAN_H + 0.3) / 2 - 0.01, IMAN_Y, 0), (IMAN_D + 0.3) / 2, IMAN_H + 0.3, 'x'),
    )
    # agujeritos en el piso para el micrófono INMP441 (va pegado adentro, contra el piso)
    mic = union(*[cylinder((12 + dx, FRENTE + 9 + dy, -EXT_Z), 0.7, PARED_TB * 3, 'z')
                  for dx, dy in [(0, 0), (2.2, 0), (-2.2, 0), (0, 2.2), (0, -2.2)]])
    # rebaje atrás para que encastre la tapa
    rebaje = box((0, PROF - 0.75, 0), (2 * HUECO_X + 2.0, 1.6, 2 * HUECO_Z + 2.0), 1.0)
    return subtract(exterior, hueco, ventana, bisel, usb, imanes, mic, rebaje)


def nucleo_tapa():
    """Tapa trasera: entra a presión en el rebaje, con ranura para el cable al cuerpo."""
    placa = box((0, 0.75, 0), (2 * HUECO_X + 2.0 - 2 * 0.15, 1.5, 2 * HUECO_Z + 2.0 - 2 * 0.15), 1.0)
    reborde = subtract(
        box((0, -1.5, 0), (2 * HUECO_X - 0.3, 3.0, 2 * HUECO_Z - 0.3), 0.8),
        box((0, -1.5, 0), (2 * HUECO_X - 3.0, 4.0, 2 * HUECO_Z - 3.0), 0.5),
    )
    ranura = box((0, 0, -HUECO_Z + CABLE_RANURA[1] / 2 + 1.5), (CABLE_RANURA[0], 10, CABLE_RANURA[1]), 1.5)
    return subtract(union(placa, reborde), ranura)


def prueba_encastre():
    """Pieza rápida (≈10 min) para comprobar que la placa entra y la pantalla queda bien encuadrada.

    Es el frente del cartucho con 9 mm de profundidad: metés la placa por atrás y mirás la ventana.
    """
    return intersect(nucleo(), box((0, 4.5, 0), (2 * EXT_X + 2, 9.0, 2 * EXT_Z + 2)))


# Bounding boxes (para generar las mallas)
BBOX_NUCLEO = ((-EXT_X, 0, -EXT_Z), (EXT_X, PROF, EXT_Z))
BBOX_TAPA = ((-HUECO_X - 1, -3, -HUECO_Z - 1), (HUECO_X + 1, 1.5, HUECO_Z + 1))
BBOX_PRUEBA = ((-EXT_X, 0, -EXT_Z), (EXT_X, 9, EXT_Z))
