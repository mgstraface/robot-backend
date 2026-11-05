"""Vistas de la cabeza + cuello de Robi v2 (render, para ver cómo queda sin imprimir)."""
import sys
import numpy as np
import robi2 as R
from render import Obj, render
from sdf import box, cylinder, rotate, translate, union, subtract

CREMA = (0.93, 0.90, 0.83)
GRIS = (0.62, 0.60, 0.56)
AZUL = (0.15, 0.25, 0.70)
NEGRO = (0.02, 0.02, 0.025)
out = sys.argv[1]
ang = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0   # inclinación del SÍ (grados)
sep = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0   # despiece (mm)

eje = (0, R.EJE_Y, R.EJE_Z)
def cab(f):  # la cabeza gira alrededor del eje del SÍ
    return rotate(f, 'x', ang, center=eje)

frente = cab(R.cabeza_frente())
tapa = cab(translate(R.cabeza_tapa(), (0, sep, 0)))
pantalla = cab(box((0, 1.2, 0), (R.VISOR_X + 0.6, 0.8, R.VISOR_Z + 0.6), 0.3))
def ojos(p):
    q = p.copy()
    a = np.radians(-ang); c, s = np.cos(a), np.sin(a)
    y, z = q[:, 1] - eje[1], q[:, 2] - eje[2]
    q[:, 2] = s * y + c * z + eje[2]
    e = np.zeros((len(p), 3))
    for ox in (-8, 8):
        d = np.maximum(np.abs(q[:, 0] - ox) - 2.2, 0) ** 2 + np.maximum(np.abs(q[:, 2] - 1) - 3.5, 0) ** 2
        e[d < 1.2] = (0.35, 0.95, 1.0)
    return e
u = translate(R.cuello_u(), (0, 0, -sep))
servo_no = translate(union(box((0, R.EJE_Y + 5.9 - 11.45, -45.5), (22.9, 12, 22.7), 0.5),
                           box((0, R.EJE_Y + 5.9 - 11.45, -40), (32.3, 12, 2.5), 0.3)), (0, 0, -2 * sep))
objs = [
    Obj(frente, CREMA, 0.5, bounds=((-30, -5, -30), (30, 35, 30))),
    Obj(tapa, CREMA, 0.5, bounds=((-30, 20, -30), (30, 40 + sep, 30))),
    Obj(pantalla, NEGRO, 0.15, emissive=ojos, bounds=((-20, -3, -14), (20, 4, 14))),
    Obj(u, GRIS, 0.55, bounds=((-33, 10, -34 - sep), (33, 35, 4 - sep))),
    Obj(servo_no, AZUL, 0.4, bounds=((-18, 5, -60 - 2 * sep), (18, 30, -30 - 2 * sep))),
]
render(objs, out, cam=(115, -170, 40), target=(0, 10, -12 - sep / 2), fov=34, size=(640, 720), ground=-58 - 2 * sep)
