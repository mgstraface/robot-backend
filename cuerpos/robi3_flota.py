import sys, numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
import robi3_cuerpo as C
from sdf import mesh
pieza = sys.argv[1]
f, b = (C.carcasa(), C.B_CARCASA) if pieza == 'cuerpo' else (C.tapa(), C.B_TAPA)
v, fc = mesh(f, b, float(sys.argv[2]))
n = len(v)
e = np.concatenate([fc[:, [0, 1]], fc[:, [1, 2]]])
g = coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n))
k, lab = connected_components(g, directed=False)
print('componentes:', k)
tri = v[fc]
for c in range(k):
    m = lab[fc[:, 0]] == c
    t = tri[m]
    vol = np.einsum('ij,ij->i', t[:, 0], np.cross(t[:, 1], t[:, 2])).sum() / 6000
    lo, hi = t.reshape(-1, 3).min(0), t.reshape(-1, 3).max(0)
    print(f'  #{c}: {m.sum()} tris, vol {vol:.3f} cm3, x {lo[0]:.1f}..{hi[0]:.1f}  y {lo[1]:.1f}..{hi[1]:.1f}  z {lo[2]:.1f}..{hi[2]:.1f}')
