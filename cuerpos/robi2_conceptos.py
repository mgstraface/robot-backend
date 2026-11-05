"""Bocetos de silueta para el cuerpo de Robi v2 (solo por fuera, para elegir el estilo). No son piezas para imprimir.

uso: python robi2_conceptos.py salida.png poroto|mini
  poroto: cuerpo redondeado con la pila 18650 parada (lo que ya tenemos)
  mini:   cuerpo bajito tipo Eilik, con una batería LiPo plana en vez de la 18650
"""
import sys

import numpy as np

import robi2 as R
from render import Obj, render
from sdf import box, capsule, cylinder, ellipsoid, intersect, smooth_union, subtract, union

CREMA = (0.94, 0.92, 0.86)
GRIS = (0.55, 0.56, 0.60)
NEGRO = (0.03, 0.03, 0.035)
ACENTO = (0.98, 0.55, 0.25)

out, tipo = sys.argv[1], sys.argv[2]
Z_TOP = -34.5
if tipo == 'poroto':
    ANCHO, PROF, ALTO, RAD = 66.0, 52.0, 94.0, 22.0
else:
    ANCHO, PROF, ALTO, RAD = 58.0, 46.0, 62.0, 19.0
CY = 18.0
Z_BOT = Z_TOP - ALTO


def ojos(p):
    e = np.zeros((len(p), 3))
    for ox in (-8, 8):
        d = np.maximum(np.abs(p[:, 0] - ox) - 2.2, 0) ** 2 + np.maximum(np.abs(p[:, 2] - 1) - 3.5, 0) ** 2
        e[d < 1.2] = (0.35, 0.95, 1.0)
    return e


# cuerpo: caja muy redondeada, un poquito más angosta arriba (forma de "poroto" / Eilik), base plana
cz = (Z_TOP + Z_BOT) / 2
def huevo(p):
    """Caja muy redondeada que se angosta suave hacia arriba (abajo 100 %, arriba ~84 %)."""
    q = p.copy()
    t = np.clip((q[:, 2] - Z_BOT) / ALTO, 0, 1)
    k = 1.0 - 0.16 * t ** 1.6
    q[:, 0] = q[:, 0] / k
    q[:, 1] = CY + (q[:, 1] - CY) / (0.5 + 0.5 * k)
    return box((0, CY, cz), (ANCHO, PROF, ALTO), RAD)(q) * 0.8


cuerpo = huevo
cuerpo = intersect(cuerpo, box((0, CY, cz + 1), (200, 200, ALTO - 0.5)))       # base plana
# pancita: panel apenas hundido al frente (zona del touch) + boquita
panel = box((0, CY - PROF / 2, Z_BOT + ALTO * 0.45), (ANCHO * 0.5, 3.0, ALTO * 0.42), 6)
cuerpo = subtract(cuerpo, intersect(panel, box((0, CY - PROF / 2 - 0.9, 0), (200, 2.4, 400))))
for i in range(5):
    x = -8 + i * 4
    cuerpo = subtract(cuerpo, box((x, CY - PROF / 2, Z_BOT + 6), (2.0, 6, 5), 0.9))

# collar redondo arriba que esconde la base de la U
collar = cylinder((0, R.EJE_Y, Z_TOP + 1.0), 17.0, 4.0, rr=1.8)

# brazos tipo aleta (redondeados, un poco abiertos)
brazos = []
for sx in (-1, 1):
    a = np.array((sx * (ANCHO / 2 + 3.0), CY - 4, Z_TOP - 16))
    b = a + np.array((sx * 4.0, 0, -ALTO * (0.42 if tipo == 'poroto' else 0.5)))
    f = capsule(a, b, 6.5, 8.0)
    f = intersect(f, box(((a[0] + b[0]) / 2, CY - 4, (a[2] + b[2]) / 2), (5.5, 30, 100), 2.0))
    brazos.append(f)

objs = [
    Obj(R.cabeza_frente(), CREMA, 0.45, bounds=((-28, -2, -20), (28, 32, 20))),
    Obj(R.cabeza_tapa(), CREMA, 0.45, bounds=((-28, 15, -20), (28, 34, 20))),
    Obj(box((0, 1.2, 0), (R.VISOR_X + 0.6, 0.8, R.VISOR_Z + 0.6), 0.3), NEGRO, 0.15, emissive=ojos,
        bounds=((-20, -1, -12), (20, 3, 12))),
    Obj(R.cuello_u(), GRIS, 0.5, bounds=((-34, 15, -35), (34, 30, 3))),
    Obj(collar, GRIS, 0.5, bounds=((-19, 3, Z_TOP - 2), (19, 42, Z_TOP + 4))),
    Obj(cuerpo, CREMA, 0.45, bounds=((-ANCHO / 2 - 1, CY - PROF / 2 - 1, Z_BOT - 1), (ANCHO / 2 + 1, CY + PROF / 2 + 1, Z_TOP + 1))),
]
for sx, f in zip((-1, 1), brazos):
    x0 = sx * (ANCHO / 2 + 3.0)
    objs.append(Obj(f, GRIS, 0.5, bounds=((min(x0, x0 + sx * 13) - 10, CY - 14, Z_BOT - 2), (max(x0, x0 + sx * 13) + 10, CY + 6, Z_TOP - 6))))
render(objs, out, cam=(150, -240, 0 if tipo == 'poroto' else -10), target=(0, 16, (18.5 + Z_BOT) / 2),
       fov=36, size=(700, 900), ground=Z_BOT - 0.3)
