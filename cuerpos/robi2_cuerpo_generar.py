"""Genera los STL del cuerpo de Robi v2 (carcasa, tapa de abajo y brazos), ya orientados para imprimir.

uso: python robi2_cuerpo_generar.py [carpeta]   (env PASO = resolución en mm, SOLO = una pieza)
"""
import os
import sys

import numpy as np

import robi2_cuerpo as C
from sdf import mesh, mesh_stats, place_on_bed, write_stl

out = sys.argv[1] if len(sys.argv) > 1 else 'stl'
os.makedirs(out, exist_ok=True)
step = float(os.environ.get('PASO', '0.3'))
SOLO = os.environ.get('SOLO')


def boca_abajo(v):          # el techo contra la cama
    return np.stack([v[:, 0], -v[:, 1], -v[:, 2]], axis=1)


def brazo_acostado(sx):     # la cara de afuera contra la cama, el hueco del bracito para arriba
    return lambda v: np.stack([v[:, 2], v[:, 1], -sx * v[:, 0]], axis=1)


piezas = [
    ('robi_cuerpo', C.carcasa, C.B_CARCASA, boca_abajo),
    ('robi_cuerpo_tapa', C.tapa, C.B_TAPA, lambda v: v),
    ('robi_brazo_der', lambda: C.brazo(1), C.B_BRAZO, brazo_acostado(1)),
    ('robi_brazo_izq', lambda: C.brazo(-1), ((-C.B_BRAZO[1][0], C.B_BRAZO[0][1], C.B_BRAZO[0][2]),
                                             (-C.B_BRAZO[0][0], C.B_BRAZO[1][1], C.B_BRAZO[1][2])), brazo_acostado(-1)),
]
for nombre, f, b, orient in piezas:
    if SOLO and SOLO not in nombre:
        continue
    v, fc = mesh(f(), b, step)
    v = place_on_bed(orient(v))
    st = mesh_stats(v, fc)
    write_stl(f'{out}/{nombre}.stl', v, fc, nombre)
    print(nombre, st)
