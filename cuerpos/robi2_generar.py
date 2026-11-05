"""Genera los STL de Robi v2 (cabeza + cuello) y chequea que sean sólidos cerrados."""
import sys, os, numpy as np
import robi2 as R
from sdf import mesh, mesh_stats, write_stl

out = sys.argv[1] if len(sys.argv) > 1 else 'stl_robi2'
os.makedirs(out, exist_ok=True)
step = float(os.environ.get('PASO', '0.25'))

def rot_x(v, deg):
    a = np.radians(deg); c, s = np.cos(a), np.sin(a)
    y, z = v[:, 1].copy(), v[:, 2].copy()
    v[:, 1], v[:, 2] = c * y - s * z, s * y + c * z
    return v

def bed(v):
    v = v.copy(); v[:, 2] -= v[:, 2].min()
    v[:, 0] -= (v[:, 0].max() + v[:, 0].min()) / 2; v[:, 1] -= (v[:, 1].max() + v[:, 1].min()) / 2
    return v

import os
SOLO = os.environ.get("SOLO")
piezas = [
    ('robi_cabeza_frente', R.cabeza_frente(), R.BOUNDS_CABEZA, 90),   # cara contra la cama
    ('robi_cabeza_tapa', R.cabeza_tapa(), R.BOUNDS_TAPA, -90),         # plana
    ('robi_cuello_u', R.cuello_u(), R.BOUNDS_U, 0),                    # parada sobre la base
]
for nombre, f, b, rx in piezas:
    if SOLO and SOLO not in nombre: continue
    v, fc = mesh(f, b, step)
    v = bed(rot_x(v, rx))
    st = mesh_stats(v, fc)
    write_stl(f'{out}/{nombre}.stl', v, fc, nombre)
    print(nombre, st)
