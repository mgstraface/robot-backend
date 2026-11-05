"""Render de Robi v2 entero (cabeza + U + cuerpo + brazos) y corte con las piezas de adentro.

uso: python robi2_cuerpo_render.py salida.png [vista]   vista = frente | espalda | corte
"""
import sys

import numpy as np

import robi2 as R
import robi2_cuerpo as C
from render import Obj, render
from sdf import box, cylinder, intersect, union

CREMA = (0.93, 0.90, 0.83)
GRIS = (0.62, 0.60, 0.56)
AZUL = (0.15, 0.25, 0.70)
NEGRO = (0.03, 0.03, 0.035)
VERDE = (0.10, 0.45, 0.20)
VIOLETA = (0.40, 0.15, 0.50)
ROJO = (0.75, 0.12, 0.10)
CELESTE = (0.20, 0.45, 0.85)

out = sys.argv[1]
vista = sys.argv[2] if len(sys.argv) > 2 else 'frente'


def ojos(p):
    e = np.zeros((len(p), 3))
    for ox in (-8, 8):
        d = np.maximum(np.abs(p[:, 0] - ox) - 2.2, 0) ** 2 + np.maximum(np.abs(p[:, 2] - 1) - 3.5, 0) ** 2
        e[d < 1.2] = (0.35, 0.95, 1.0)
    return e


def caja(x, y, z, r=0.3):
    return C.bloque(x, y, z, r)


corte = vista == 'corte'
if corte:   # se saca la mitad de adelante del cuerpo (y < 9) para ver adentro
    def cortar(f):
        return intersect(f, box((0, 60, -80), (200, 102, 200)))
else:
    def cortar(f):
        return f

objs = [
    Obj(R.cabeza_frente(), CREMA, 0.5, bounds=((-28, -2, -20), (28, 32, 20))),
    Obj(R.cabeza_tapa(), CREMA, 0.5, bounds=((-28, 15, -20), (28, 34, 20))),
    Obj(box((0, 1.2, 0), (R.VISOR_X + 0.6, 0.8, R.VISOR_Z + 0.6), 0.3), NEGRO, 0.15, emissive=ojos,
        bounds=((-20, -1, -12), (20, 3, 12))),
    Obj(R.cuello_u(), GRIS, 0.55, bounds=((-34, 15, -35), (34, 30, 3))),
    Obj(cortar(C.carcasa()), CREMA, 0.5, bounds=((-33, -8, -125.5), (33, 40, -33.5))),
    Obj(C.tapa(), GRIS, 0.55, bounds=((-33, -8, -128), (33, 40, -122))),
    Obj(C.brazo(1), CREMA, 0.5, bounds=((35, -6, -92), (43, 14, -40))),
    Obj(C.brazo(-1), CREMA, 0.5, bounds=((-43, -6, -92), (-35, 14, -40))),
]
if corte:
    piezas = [
        (union(caja(C.PILA_X, C.PILA_Y, C.PILA_Z, 2)), CELESTE),
        (union(caja((-5.9, 17), (16.35, 28.35), (C.NO_BASE_Z, C.NO_TAPA_Z), 0.5),
               caja((-10.6, 21.7), (16.35, 28.35), (C.NO_OREJA_Z0, C.NO_OREJA_Z0 + 2.5))), AZUL),
        (caja((-4, 28), (19.4, C.X7_CARA), (C.X7_Z0, C.X7_Z1)), VIOLETA),
        (caja((-4.8, 22.8), (12, 13.5), (-112, -72), 0.2), VERDE),
        (caja((10, 21), (8, 12), (-100, -80), 4.9), NEGRO),                    # capacitor (de muestra)
        (caja((15, 30), (21.85, 30.15), (-87, -72)), NEGRO),                   # interruptor
        (caja((C.ESPALDA[0] - 5.35, C.ESPALDA[0] + 5.35), (35.9, 37.9), (C.ESPALDA[1] - 7.6, C.ESPALDA[1] + 7.6)), ROJO),
    ]
    for f, col in piezas:
        objs.append(Obj(cortar(f), col, 0.4, bounds=((-31, 8, -125), (31, 38, -38))))

if vista == 'espalda':
    cam, target = (-130, 260, -10), (0, 16, -60)
elif corte:
    cam, target = (150, -200, 10), (0, 16, -70)
else:
    cam, target = (140, -230, 10), (0, 16, -55)
render(objs, out, cam=cam, target=target, fov=36, size=(700, 900), ground=C.Z_BOT - 1.0)
