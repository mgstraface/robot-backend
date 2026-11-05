"""
Piezas de encastre compartidas por TODOS los cuerpos. Mientras se respeten, cualquier cabeza
recibe el mismo núcleo y cualquier cuerpo usa los mismos servos y la misma base.

Coordenadas de CABEZA: origen en el centro del frente del núcleo ya colocado (el núcleo mira a -y).
Coordenadas de TORSO:  origen en el centro de la base del torso (z = 0 es donde apoya).
Coordenadas de BASE:   origen en el centro del piso de la base.
"""
import numpy as np

import nucleo as N
from medidas import *
from sdf import bounded, box, cylinder, everything, intersect, offset, subtract, union

H = HOLGURA

# ======================================================================= CABEZA

EJE_CABEZA_Y = N.PROF / 2  # el eje del servo del cuello queda bajo el centro del núcleo
CABEZA_APOYO_Z = -32.0  # cara inferior de la cabeza (apoya sobre el brazo del servo)


def cabeza_con_nucleo(exterior, espesor=2.4):
    """Toma el sólido exterior de una cabeza y le hace todo lo necesario para el núcleo:
    la vacía, le agrega el bloque que sostiene el cartucho, la ventana, los imanes,
    la ranura del USB-C, el cuello con encastre para el brazo del servo y el paso de cables."""
    def hueca(p):
        d = exterior(p)
        return np.maximum(d, -(d + espesor))

    # bloque que rodea el alojamiento (solo adentro de la cabeza)
    bloque = intersect(
        box((0, N.PROF / 2 - 1.5, 0), (2 * (N.EXT_X + H + 4.5), N.PROF + 9, 2 * (N.EXT_Z + H + 4)), 4.0),
        exterior,
    )
    # cuello: un "hueso" corto que baja hasta el servo y se une al bloque
    cuello = union(
        cylinder((0, EJE_CABEZA_Y, (CABEZA_APOYO_Z - N.EXT_Z) / 2), 11.0, -N.EXT_Z - CABEZA_APOYO_Z, 'z', rr=1.5),
        box((0, EJE_CABEZA_Y, -N.EXT_Z - 3), (24, 22, 8), 3),
    )
    solido = union(hueca, bloque, cuello)

    alojamiento = _alojamiento()
    # la ventana se mete 4 mm en el alojamiento: así no queda ninguna membrana entre los dos cortes
    ventana = box((N.VISOR_DESPLAZ_X, -13, 0), (N.VENTANA_X + 1.2, 34, N.VENTANA_Z + 1.2), 2.2)
    imanes = union(*[
        cylinder((s * (N.EXT_X + H + (IMAN_H + 0.3) / 2 - 0.01), N.IMAN_Y, 0), (IMAN_D + 0.3) / 2, IMAN_H + 0.3, 'x')
        for s in (1, -1)
    ])
    usb = box((-(N.EXT_X + 25), N.USB_CENTRO_Y, 0), (50, USB_ALTO + 2.5, USB_ANCHO + 2.5), 2.0)
    # encastre del brazo doble del servo (horn) en la cara de abajo del cuello
    horn = union(
        box((0, EJE_CABEZA_Y, CABEZA_APOYO_Z + HORN_ESPESOR / 2), (2 * HORN_LARGO + 2 * H, HORN_ANCHO_BASE + 2 * H, HORN_ESPESOR * 2), 1.0),
        cylinder((0, EJE_CABEZA_Y, CABEZA_APOYO_Z), 4.0, 8.0, 'z'),
    )
    tornillo = cylinder((0, EJE_CABEZA_Y, -N.EXT_Z - 10), 1.2, 30, 'z')
    cables = box((0, EJE_CABEZA_Y + 17, CABEZA_APOYO_Z), (14, 9, 2 * (-N.EXT_Z - CABEZA_APOYO_Z) + 6), 2.0)
    return subtract(solido, alojamiento, ventana, imanes, usb, horn, tornillo, cables)


def _alojamiento():
    return box((0, 40, 0), (2 * (N.EXT_X + H), 80, 2 * (N.EXT_Z + H)), N.RADIO + H)


def tapa_nuca(exterior, espesor=2.4):
    """Tapa que cierra la nuca (el hueco por donde entra el núcleo). Es el pedazo de cáscara que
    sacó el alojamiento, con un reborde que entra a presión. Atrás del núcleo queda lugar para los cables,
    que salen por abajo de la cabeza."""
    def cascara(p):
        d = exterior(p)
        return np.maximum(d, -(d + espesor))

    hueco = box((0, 40, 0), (2 * (N.EXT_X + H) - 2 * 0.15, 80, 2 * (N.EXT_Z + H) - 2 * 0.15), N.RADIO)
    # solo la parte de atrás del núcleo (adelante el alojamiento atraviesa el bloque, no la cáscara)
    trozo = intersect(cascara, hueco, lambda p: (N.PROF + 4) - p[..., 1])
    aro = subtract(hueco, box((0, 40, 0), (2 * (N.EXT_X + H) - 3.6, 90, 2 * (N.EXT_Z + H) - 3.6), 1.0))
    reborde = intersect(aro, lambda p: np.maximum(exterior(p) + espesor - 0.01, -(exterior(p) + espesor + 3.0)),
                        lambda p: (N.PROF + 4) - p[..., 1])
    return union(trozo, reborde)


# ======================================================================= TORSO (servos)

TORSO_ALTO = 58.0
HOMBRO_X = 26.0  # cara lateral donde se atornillan los servos de los brazos
HOMBRO_Z = TORSO_ALTO - 12.0  # altura del eje de los brazos
EJE_TORSO_Y = 0.0  # eje del cuello en el torso
SERVO_DESFASE = SERVO_LARGO / 2 - SERVO_EJE_DESDE_PUNTA  # cuerpo del servo corrido respecto de su eje

# lo que sobresale el servo del cuello por encima del torso (cuerpo sobre las orejas + engranaje + horn)
CUELLO_SOBRESALE = (SERVO_ALTO - SERVO_OREJAS_Z - SERVO_OREJAS_ALTO) + SERVO_ENGRANAJE_ALTO + HORN_ESPESOR


def _alojamiento_servo(eje, hacia, z_eje_o_tope):
    """Hueco para un MG90S con las orejas al ras de la cara exterior.

    eje: (x, y, z) del eje de salida en la cara; hacia: 'z' (sale para arriba) o '+x' / '-x'."""
    ex, ey, ez = eje
    prof_cuerpo = SERVO_OREJAS_Z + SERVO_OREJAS_ALTO + 0.6
    w = SERVO_ANCHO + 2 * H
    l = SERVO_LARGO + 2 * H
    lo = SERVO_OREJAS_LARGO + 2 * H
    if hacia == 'z':
        cuerpo = box((ex, ey + SERVO_DESFASE, ez - prof_cuerpo / 2 + 0.01), (w, l, prof_cuerpo), 0.6)
        orejas = box((ex, ey + SERVO_DESFASE, ez - (SERVO_OREJAS_ALTO + 0.3) / 2 + 0.01), (w, lo, SERVO_OREJAS_ALTO + 0.3), 0.6)
        tornillos = union(*[cylinder((ex, ey + SERVO_DESFASE + s * SERVO_TORNILLOS / 2, ez - 6), TORNILLO_M2_GUIA / 2, 12, 'z') for s in (1, -1)])
        cables = box((ex, ey + SERVO_DESFASE + l / 2, ez - prof_cuerpo + 3), (6, 6, 8), 1)
        return union(cuerpo, orejas, tornillos, cables)
    s = 1 if hacia == '+x' else -1
    cuerpo = box((ex - s * prof_cuerpo / 2 + s * 0.01, ey + SERVO_DESFASE, ez), (prof_cuerpo, l, w), 0.6)
    orejas = box((ex - s * (SERVO_OREJAS_ALTO + 0.3) / 2 + s * 0.01, ey + SERVO_DESFASE, ez), (SERVO_OREJAS_ALTO + 0.3, lo, w), 0.6)
    tornillos = union(*[cylinder((ex - s * 6, ey + SERVO_DESFASE + t * SERVO_TORNILLOS / 2, ez), TORNILLO_M2_GUIA / 2, 12, 'x') for t in (1, -1)])
    return union(cuerpo, orejas, tornillos)


def torso_con_servos(exterior):
    """Al sólido de un torso le hace los alojamientos de los 3 servos, el canal de cables y los
    agujeros para atornillarlo a la base."""
    huecos = union(
        _alojamiento_servo((0, EJE_TORSO_Y, TORSO_ALTO), 'z', None),
        _alojamiento_servo((HOMBRO_X, EJE_TORSO_Y, HOMBRO_Z), '+x', None),
        _alojamiento_servo((-HOMBRO_X, EJE_TORSO_Y, HOMBRO_Z), '-x', None),
        # canal de cables: de los servos hasta abajo
        box((0, EJE_TORSO_Y + 4, (TORSO_ALTO - 22) / 2 - 1), (26, 16, TORSO_ALTO - 20), 3),
        # tornillos M3 desde adentro de la base
        cylinder((16, EJE_TORSO_Y + 4, 6), TORNILLO_M3_GUIA / 2, 14, 'z'),
        cylinder((-16, EJE_TORSO_Y + 4, 6), TORNILLO_M3_GUIA / 2, 14, 'z'),
        # el cable de la cabeza baja por atrás del servo del cuello
        box((0, EJE_TORSO_Y + 19, TORSO_ALTO - 10), (12, 8, 24), 2),
    )
    return subtract(exterior, huecos)


def torso_minimo():
    """Volumen mínimo que tiene que tener cualquier torso para contener los servos (para modelar encima)."""
    return union(
        box((0, EJE_TORSO_Y + 5, TORSO_ALTO - 12), (2 * HOMBRO_X, 34, 24), 4),
        box((0, EJE_TORSO_Y + 4, (TORSO_ALTO - 12) / 2), (36, 26, TORSO_ALTO - 12), 4),
    )


# ======================================================================= BRAZOS

def cubo_brazo():
    """Disco que se atornilla al brazo simple del servo. Coordenadas: eje en el origen, el brazo
    sale hacia +x (lado derecho); la cara interna (contra el servo) está en x = 0."""
    disco = cylinder((3.0, 0, 0), 8.0, 6.0, 'x', rr=1.2)
    return disco


def cubo_brazo_huecos():
    horn = union(
        box((HORN_ESPESOR / 2, 0, -HORN_LARGO / 2 + 3), (HORN_ESPESOR * 2 + 0.4, HORN_ANCHO_BASE + 2 * H, HORN_LARGO + 2), 1.0),
        cylinder((0, 0, 0), 4.0, 6.0, 'x'),
    )
    tornillo = cylinder((3, 0, 0), 1.2, 14, 'x')
    cabeza_tornillo = cylinder((6.5, 0, 0), 2.6, 2.2, 'x')
    return union(horn, tornillo, cabeza_tornillo)


# ======================================================================= BASE (electrónica)

BASE_X = 104.0
BASE_Y = 74.0
BASE_Z = 46.0
BASE_PARED = 2.4
TAPA_REBAJE = 2.0  # la tapa de abajo entra en este rebaje
TORSO_EN_BASE_Y = -8.0  # dónde se para el torso sobre la base (y)
TORNILLOS_TAPA = [(sx * (BASE_X / 2 - 8), sy * (BASE_Y / 2 - 8)) for sx in (1, -1) for sy in (1, -1)]


def base_con_electronica(exterior):
    """Vacía una base, le hace la rejilla del parlante adelante, el interruptor al costado,
    las torres para la tapa de abajo y los agujeros para el torso y los cables."""
    def hueca(p):
        d = exterior(p)
        return np.maximum(d, -(d + BASE_PARED))

    interior = box((0, 0, BASE_Z / 2 - 3), (BASE_X - 2 * BASE_PARED - 0.2, BASE_Y - 2 * BASE_PARED - 0.2, BASE_Z), 3)
    torres = union(*[cylinder((x, y, (BASE_Z - BASE_PARED) / 2 + TAPA_REBAJE / 2), 4.2, BASE_Z - BASE_PARED - TAPA_REBAJE, 'z') for x, y in TORNILLOS_TAPA])
    aro_parlante = cylinder((0, -BASE_Y / 2 + BASE_PARED + 1.5, BASE_Z / 2), PARLANTE_D / 2 + 2.5, 3.0, 'y')
    soportes_torso = union(*[cylinder((x, TORSO_EN_BASE_Y + 4, BASE_Z - BASE_PARED - 3), 4.0, 6, 'z') for x in (16, -16)])
    solido = union(hueca, intersect(union(torres, aro_parlante, soportes_torso), interior))

    rejilla = bounded(union(*[
        cylinder((x, -BASE_Y / 2, BASE_Z / 2 + z), 1.4, 12, 'y')
        for x in np.arange(-15, 15.1, 4.5) for z in np.arange(-15, 15.1, 4.5)
        if x * x + z * z <= 16.5 ** 2
    ]), (-18, -BASE_Y / 2 - 6, BASE_Z / 2 - 18), (18, -BASE_Y / 2 + 6, BASE_Z / 2 + 18))
    hueco_parlante = cylinder((0, -BASE_Y / 2 + BASE_PARED + 1.5, BASE_Z / 2), PARLANTE_D / 2 + 0.4, 3.2, 'y')
    interruptor = box((BASE_X / 2, 10, BASE_Z / 2), (12, INTERRUPTOR_ANCHO + 2 * H, INTERRUPTOR_ALTO + 2 * H), 0.8)
    rebaje = box((0, 0, TAPA_REBAJE / 2 - 0.5), (BASE_X - 2 * BASE_PARED + 2.4, BASE_Y - 2 * BASE_PARED + 2.4, TAPA_REBAJE + 1), 3)
    pilotos = union(*[cylinder((x, y, 8), TORNILLO_M3_GUIA / 2, 16, 'z') for x, y in TORNILLOS_TAPA])
    torso = union(*[cylinder((x, TORSO_EN_BASE_Y + 4, BASE_Z - 3), TORNILLO_M3_PASO / 2, 14, 'z') for x in (16, -16)])
    cables = box((0, TORSO_EN_BASE_Y + 4, BASE_Z), (18, 12, 10), 2)
    return subtract(solido, rejilla, hueco_parlante, interruptor, rebaje, pilotos, torso, cables)


def tapa_base():
    """Tapa de abajo de la base (igual para todos los cuerpos). Se atornilla con 4 M3."""
    placa = box((0, 0, TAPA_REBAJE / 2), (BASE_X - 2 * BASE_PARED + 2.4 - 2 * H, BASE_Y - 2 * BASE_PARED + 2.4 - 2 * H, TAPA_REBAJE), 3)
    agujeros = union(*[union(cylinder((x, y, 0), TORNILLO_M3_PASO / 2, 10, 'z'), cylinder((x, y, 0), 3.2, 2.4, 'z'))
                       for x, y in TORNILLOS_TAPA])
    patas = union(*[cylinder((x * 0.8, y * 0.7, -0.5), 5, 1.5, 'z') for x, y in TORNILLOS_TAPA])
    ventilacion = union(*[box((x, 0, 1), (2, 30, 6), 1) for x in np.arange(-20, 20.1, 6)])
    return subtract(union(placa, patas), agujeros, ventilacion)


BBOX_TAPA_BASE = ((-BASE_X / 2, -BASE_Y / 2, -1.5), (BASE_X / 2, BASE_Y / 2, TAPA_REBAJE + 0.1))
