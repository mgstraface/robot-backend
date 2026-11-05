"""Posiciones de cada pieza en el robot armado (para los renders y para chequear que encajan)."""
import numpy as np

import interfaz as I
import nucleo as N
from medidas import *
from sdf import box, translate

# Altura a la que queda la cara de abajo de la cabeza: arriba del torso + lo que sobresale el servo,
# menos lo que el brazo del servo se mete en el encastre de la cabeza.
TORSO_Z = I.BASE_Z
TORSO_Y = I.TORSO_EN_BASE_Y
CABEZA_ORIGEN = (0.0, TORSO_Y + I.EJE_TORSO_Y - I.EJE_CABEZA_Y, TORSO_Z + I.TORSO_ALTO + I.CUELLO_SOBRESALE - HORN_ESPESOR - I.CABEZA_APOYO_Z)
HOMBRO_SALIDA = (SERVO_ALTO - SERVO_OREJAS_Z - SERVO_OREJAS_ALTO) + SERVO_ENGRANAJE_ALTO - 1.0
BRAZO_DER_ORIGEN = (I.HOMBRO_X + HOMBRO_SALIDA, TORSO_Y + I.EJE_TORSO_Y, TORSO_Z + I.HOMBRO_Z)
BRAZO_IZQ_ORIGEN = (-I.HOMBRO_X - HOMBRO_SALIDA, TORSO_Y + I.EJE_TORSO_Y, TORSO_Z + I.HOMBRO_Z)


def en_cabeza(f):
    return translate(f, CABEZA_ORIGEN)


def en_torso(f):
    return translate(f, (0, TORSO_Y, TORSO_Z))


def pantalla():
    """La pantalla dentro del núcleo (solo para el render)."""
    return en_cabeza(box((N.VISOR_DESPLAZ_X, N.FRENTE + 0.6, 0), (PLACA_ANCHO - 1, 1.2, PLACA_ALTO - 1), 0.5))


def ojos_emisivos(color, estilo='tierno'):
    """Luz de los ojos dibujados en la pantalla (coordenadas del mundo → de la pantalla)."""
    color = np.asarray(color, float)
    cx, cy, cz = CABEZA_ORIGEN

    def f(p):
        x = p[:, 0] - cx - N.VISOR_DESPLAZ_X
        z = p[:, 2] - cz
        out = np.zeros((len(p), 3))
        for ex in (-8.0, 8.0):
            dx = np.maximum(np.abs(x - ex) - 1.4, 0)
            dz = np.maximum(np.abs(z) - 3.6, 0)
            dentro = dx * dx + dz * dz < 2.6 ** 2
            if estilo == 'terror':
                # párpado: corta la parte de arriba con una diagonal que baja hacia la nariz
                lado = np.sign(ex)
                ceja = 3.2 - 0.9 * (lado * (x - ex))  # más bajo del lado de adentro
                dentro &= z < ceja
            out[dentro] = color * 2.2
            # brillo alrededor
            d = np.sqrt(((x - ex) / 5.0) ** 2 + (z / 7.0) ** 2)
            out += color[None, :] * np.clip(0.55 - 0.35 * d, 0, None)[:, None] * 0.6
        return out

    return f


def servos():
    """Los tres MG90S puestos en el torso (solo para el render)."""
    from sdf import union, cylinder
    T = I.TORSO_ALTO
    d = I.SERVO_DESFASE
    arriba = SERVO_ALTO - SERVO_OREJAS_Z - SERVO_OREJAS_ALTO
    piezas = [
        # cuello: cuerpo que asoma arriba del torso + torre del engranaje
        box((0, I.EJE_TORSO_Y + d, T + arriba / 2), (SERVO_ANCHO, SERVO_LARGO, arriba), 0.8),
        cylinder((0, I.EJE_TORSO_Y, T + arriba + SERVO_ENGRANAJE_ALTO / 2), 5.8, SERVO_ENGRANAJE_ALTO, 'z'),
    ]
    for s in (1, -1):
        piezas += [
            box((s * (I.HOMBRO_X + arriba / 2), I.EJE_TORSO_Y + d, I.HOMBRO_Z), (arriba, SERVO_LARGO, SERVO_ANCHO), 0.8),
            cylinder((s * (I.HOMBRO_X + arriba + SERVO_ENGRANAJE_ALTO / 2), I.EJE_TORSO_Y, I.HOMBRO_Z), 5.8, SERVO_ENGRANAJE_ALTO, 'x'),
        ]
    return en_torso(union(*piezas))
