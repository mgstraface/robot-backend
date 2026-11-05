"""Genera TODOS los STL de Robi v3 (cabeza, mecanismo, collar, cuerpo, tapa de abajo y brazos), ya orientados
para imprimir, y chequea que sean sólidos cerrados.

uso: python robi3_generar.py [carpeta]   (env PASO = resolución en mm, SOLO = una pieza)
"""
import os
import sys

import numpy as np

import robi3 as R
import robi3_cuerpo as C
from sdf import mesh, mesh_stats, place_on_bed, write_stl

out = sys.argv[1] if len(sys.argv) > 1 else 'stl/v3'
os.makedirs(out, exist_ok=True)
step = float(os.environ.get('PASO', '0.25'))
SOLO = os.environ.get('SOLO')


def rot(m):
    m = np.asarray(m, float)
    assert abs(np.linalg.det(m) - 1) < 1e-9          # rotación (no espejo)
    return lambda v: v @ m.T


CARA_ABAJO = rot([[1, 0, 0], [0, 0, -1], [0, 1, 0]])     # cabeza: la cara (y mínima) contra la cama
ATRAS_ABAJO = rot([[1, 0, 0], [0, 0, 1], [0, -1, 0]])    # tapa de la cabeza: la espalda contra la cama
DER_ABAJO = rot([[0, 0, 1], [0, 1, 0], [-1, 0, 0]])      # x máxima contra la cama
IZQ_ABAJO = rot([[0, 0, -1], [0, 1, 0], [1, 0, 0]])      # x mínima contra la cama
BOCA_ABAJO = rot([[1, 0, 0], [0, -1, 0], [0, 0, -1]])    # el techo contra la cama
IGUAL = rot(np.eye(3))

piezas = [
    ('robi3_cabeza_frente', R.cabeza_frente, R.BOUNDS_CABEZA, CARA_ABAJO),
    ('robi3_cabeza_tapa', R.cabeza_tapa, R.BOUNDS_TAPA, ATRAS_ABAJO),
    ('robi3_mecanismo', R.mecanismo, R.BOUNDS_MEC, DER_ABAJO),
    ('robi3_collar', R.collar, R.BOUNDS_COLLAR, IGUAL),
    ('robi3_cuerpo', C.carcasa, C.B_CARCASA, BOCA_ABAJO),
    ('robi3_cuerpo_tapa', C.tapa, C.B_TAPA, IGUAL),
    ('robi3_brazo_der', lambda: C.brazo(1), C.b_brazo(1), DER_ABAJO),
    ('robi3_brazo_izq', lambda: C.brazo(-1), C.b_brazo(-1), IZQ_ABAJO),
]
for nombre, f, b, orient in piezas:
    if SOLO and SOLO not in nombre:
        continue
    v, fc = mesh(f(), b, step)
    v = place_on_bed(orient(v))
    st = mesh_stats(v, fc)
    write_stl(f'{out}/{nombre}.stl', v, fc, nombre)
    print(nombre, st, flush=True)
