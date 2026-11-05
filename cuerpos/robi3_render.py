"""Render final de Robi v3: a la izquierda entero (cabeza + collar + cuerpo poroto + brazos), a la derecha
cortado por delante (y > 7) con las piezas de adentro. Una sola imagen.

uso: python robi3_render.py salida.png
"""
import os
import sys

import numpy as np
from PIL import Image

import robi3 as R
import robi3_cuerpo as C
from render import Obj, render
from sdf import box, intersect

CREMA = (0.93, 0.90, 0.83)
GRIS = (0.55, 0.56, 0.60)
NEGRO = (0.03, 0.03, 0.035)
AZUL = (0.15, 0.25, 0.70)
VERDE = (0.10, 0.45, 0.20)
VIOLETA = (0.40, 0.15, 0.50)
ROJO = (0.75, 0.12, 0.10)
CELESTE = (0.20, 0.45, 0.85)
PLATA = (0.70, 0.70, 0.72)

out = sys.argv[1]


def ojos(p):
    e = np.zeros((len(p), 3))
    for ox in (-8, 8):
        d = np.maximum(np.abs(p[:, 0] - ox) - 2.2, 0) ** 2 + np.maximum(np.abs(p[:, 2] - 1) - 3.5, 0) ** 2
        e[d < 1.2] = (0.35, 0.95, 1.0)
    return e


def escena(corte):
    cut = (lambda f: intersect(f, box((0, 57, -60), (200, 100, 300)))) if corte else (lambda f: f)
    B = ((-C.HX - 1, C.CY - C.HY - 1, C.Z_BOT - 1), (C.HX + 1, C.CY + C.HY + 1, C.Z_TOP + 1))
    objs = [
        Obj(R.cabeza_frente(), CREMA, 0.45, bounds=((-31, -1, -21), (31, 32, 19))),
        Obj(R.cabeza_tapa(), CREMA, 0.45, bounds=((-31, 27, -21), (31, 37, 19))),
        Obj(box((0, 1.2, 0), (R.VISOR_X + 0.6, 0.8, R.VISOR_Z + 0.6), 0.3), NEGRO, 0.15, emissive=ojos,
            bounds=((-20, -1, -12), (20, 3, 12))),
        Obj(R.mecanismo(), GRIS, 0.5, bounds=R.BOUNDS_MEC),
        Obj(R.collar(), GRIS, 0.5, bounds=R.BOUNDS_COLLAR),
        Obj(cut(C.carcasa()), CREMA, 0.45, bounds=B),
        Obj(C.tapa(), GRIS, 0.55, bounds=(B[0], (B[1][0], B[1][1], C.Z_PISO + 22))),
        Obj(C.brazo(1), CREMA, 0.45, bounds=C.b_brazo(1)),
        Obj(C.brazo(-1), CREMA, 0.45, bounds=C.b_brazo(-1)),
    ]
    if corte:
        P = C.PIEZAS
        cajas = [('servo NO (cuerpo)', AZUL), ('servo NO (orejitas)', AZUL), ('servo brazo der', AZUL),
                 ('orejitas brazo der', AZUL), ('servo brazo izq', AZUL), ('orejitas brazo izq', AZUL),
                 ('pila', CELESTE), ('X7', VIOLETA), ('interruptor', NEGRO), ('touch espalda', ROJO),
                 ('MPU6050', AZUL), ('amplificador', VIOLETA), ('mic', VERDE)]
        for n, col in cajas:
            objs.append(Obj(cut(C.bloque(*P[n], 0.4)), col, 0.4, bounds=tuple(zip(*[(a - 1, b + 1) for a, b in P[n]]))))
        pz = C.PERFO
        objs.append(Obj(cut(C.bloque(pz['x'], pz['y'], pz['z'], 0.2)), VERDE, 0.5,
                        bounds=((pz['x'][0] - 1, 10, pz['z'][0] - 1), (pz['x'][1] + 1, 15, pz['z'][1] + 1))))
    return objs


tmp = out + '.tmp.png'
paneles = []
for corte, cam in ((False, (150, -250, 10)), (True, (130, -230, 30))):
    render(escena(corte), tmp, cam=cam, target=(0, 16, -55), fov=34, size=(640, 900), ground=C.Z_BOT - 0.3)
    paneles.append(Image.open(tmp).convert('RGB'))
os.remove(tmp)
img = Image.new('RGB', (sum(p.width for p in paneles), paneles[0].height))
x = 0
for p in paneles:
    img.paste(p, (x, 0))
    x += p.width
img.save(out)
print('listo', out)
