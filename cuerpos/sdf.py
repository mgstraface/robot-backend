"""
Modelador 3D por campos de distancia con signo (SDF), sin dependencias raras.

Cada forma es una función f(p) -> distancia, donde p es un array (..., 3) de puntos en milímetros.
Negativo = adentro, positivo = afuera. Las operaciones (unión, resta, redondeos) combinan funciones.
Después se convierte en malla con marching cubes y se exporta a STL binario para imprimir.

Ejes: x a la derecha, y hacia atrás (el frente del robot mira a -y), z hacia arriba.
"""
import struct

import numpy as np
from skimage.measure import marching_cubes

# ---------------------------------------------------------------- utilidades


def _v(x):
    return np.asarray(x, dtype=np.float64)


def length(p):
    return np.sqrt(np.sum(p * p, axis=-1))


# ---------------------------------------------------------------- primitivas


def sphere(c, r):
    c = _v(c)
    return lambda p: length(p - c) - r


def box(c, size, r=0.0):
    """Caja centrada en c con medidas totales `size`, esquinas redondeadas de radio r."""
    c = _v(c)
    h = _v(size) / 2 - r

    def f(p):
        q = np.abs(p - c) - h
        outside = length(np.maximum(q, 0.0))
        inside = np.minimum(np.max(q, axis=-1), 0.0)
        return outside + inside - r

    return f


def ellipsoid(c, radii):
    """Elipsoide (aproximación de distancia que alcanza para modelar)."""
    c = _v(c)
    rr = _v(radii)

    def f(p):
        q = (p - c) / rr
        k0 = length(q)
        k1 = length(q / rr)
        return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)

    return f


_AXES = {'x': 0, 'y': 1, 'z': 2}


def cylinder(c, r, h, axis='z', rr=0.0):
    """Cilindro de radio r y alto total h a lo largo de `axis`, bordes redondeados rr."""
    c = _v(c)
    a = _AXES[axis]
    others = [i for i in range(3) if i != a]

    def f(p):
        q = p - c
        d_rad = np.sqrt(q[..., others[0]] ** 2 + q[..., others[1]] ** 2) - (r - rr)
        d_ax = np.abs(q[..., a]) - (h / 2 - rr)
        dx = np.maximum(d_rad, 0.0)
        dz = np.maximum(d_ax, 0.0)
        return np.minimum(np.maximum(d_rad, d_ax), 0.0) + np.sqrt(dx * dx + dz * dz) - rr

    return f


def capsule(a, b, r, r2=None):
    """Cápsula (tubo con puntas redondas) de a a b. Con r2, el radio va de r a r2 (cónica)."""
    a = _v(a)
    b = _v(b)
    ba = b - a
    L2 = float(np.dot(ba, ba))
    r2 = r if r2 is None else r2

    def f(p):
        pa = p - a
        h = np.clip(np.sum(pa * ba, axis=-1) / L2, 0.0, 1.0)
        return length(pa - h[..., None] * ba) - (r + (r2 - r) * h)

    return f


def torus(c, R, r, axis='z'):
    c = _v(c)
    a = _AXES[axis]
    others = [i for i in range(3) if i != a]

    def f(p):
        q = p - c
        ring = np.sqrt(q[..., others[0]] ** 2 + q[..., others[1]] ** 2) - R
        return np.sqrt(ring * ring + q[..., a] ** 2) - r

    return f


def halfspace(normal, offset):
    """Semiespacio: adentro es donde dot(p, n) < offset."""
    n = _v(normal) / np.linalg.norm(normal)
    return lambda p: np.sum(p * n, axis=-1) - offset


def bounded(f, lo, hi, margin=1.0):
    """Optimización: fuera de la caja [lo, hi] (más un margen) devuelve la distancia a la caja
    en vez de calcular f, que puede ser cara (ej. una rejilla de 60 agujeros). Es una cota inferior
    segura para mallar y para el render."""
    lo = _v(lo) - margin
    hi = _v(hi) + margin
    c = (lo + hi) / 2
    h = (hi - lo) / 2

    def g(p):
        q = np.abs(p - c) - h
        d = length(np.maximum(q, 0.0)) + np.minimum(np.max(q, axis=-1), 0.0)
        out = d + margin
        cerca = d <= 0
        if np.any(cerca):
            out = out.copy() if np.ndim(out) else out
            out[cerca] = f(p[cerca])
        return out

    return g


def everything():
    return lambda p: np.full(p.shape[:-1], -1e9)


# ---------------------------------------------------------------- operaciones


def union(*fs):
    def f(p):
        d = fs[0](p)
        for g in fs[1:]:
            d = np.minimum(d, g(p))
        return d

    return f


def intersect(*fs):
    def f(p):
        d = fs[0](p)
        for g in fs[1:]:
            d = np.maximum(d, g(p))
        return d

    return f


def subtract(a, *bs):
    def f(p):
        d = a(p)
        for b in bs:
            d = np.maximum(d, -b(p))
        return d

    return f


def smooth_union(a, b, k):
    def f(p):
        da, db = a(p), b(p)
        h = np.clip(0.5 + 0.5 * (db - da) / k, 0.0, 1.0)
        return db + (da - db) * h - k * h * (1.0 - h)

    return f


def smooth_union_all(fs, k):
    f = fs[0]
    for g in fs[1:]:
        f = smooth_union(f, g, k)
    return f


def smooth_subtract(a, b, k):
    """Resta b de a con el borde redondeado (radio aprox. k)."""
    def f(p):
        da, db = a(p), b(p)
        h = np.clip(0.5 - 0.5 * (da + db) / k, 0.0, 1.0)
        return da * (1.0 - h) - db * h + k * h * (1.0 - h)

    return f


def shell(f, t, inward=True):
    """Cáscara de espesor t (hacia adentro de la superficie)."""
    if inward:
        return lambda p: np.maximum(f(p), -(f(p) + t))
    return lambda p: np.abs(f(p)) - t / 2


def offset(f, d):
    return lambda p: f(p) - d


# ---------------------------------------------------------------- transformaciones


def translate(f, t):
    t = _v(t)
    return lambda p: f(p - t)


def _rot_matrix(axis, deg):
    a = np.radians(deg)
    c, s = np.cos(a), np.sin(a)
    if axis == 'x':
        return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    if axis == 'y':
        return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def rotate(f, axis, deg, center=(0, 0, 0)):
    """Rota la forma `deg` grados alrededor de `axis` pasando por `center`."""
    m = _rot_matrix(axis, -deg)  # se rota el punto al revés
    c = _v(center)
    return lambda p: f((p - c) @ m.T + c)


def mirror_x(f):
    """Simetría izquierda/derecha: modela un lado (x >= 0) y lo refleja."""

    def g(p):
        q = p.copy()
        q[..., 0] = np.abs(q[..., 0])
        return f(q)

    return g


def scale(f, s, center=(0, 0, 0)):
    c = _v(center)
    return lambda p: f((p - c) / s + c) * s


# ---------------------------------------------------------------- malla y STL


def mesh(f, bounds, step):
    """Convierte la SDF en malla (vértices, caras) dentro de bounds=((x0,y0,z0),(x1,y1,z1))."""
    lo = _v(bounds[0]) - 2 * step
    hi = _v(bounds[1]) + 2 * step
    n = np.ceil((hi - lo) / step).astype(int) + 1
    xs = [lo[i] + np.arange(n[i]) * step for i in range(3)]
    vol = np.empty(tuple(n), dtype=np.float32)
    # por capas en x para no gastar demasiada memoria
    Y, Z = np.meshgrid(xs[1], xs[2], indexing='ij')
    for i, x in enumerate(xs[0]):
        pts = np.stack([np.full_like(Y, x), Y, Z], axis=-1)
        vol[i] = f(pts)
    # borde siempre "afuera" para que la malla quede cerrada
    vol[0, :, :] = vol[-1, :, :] = step
    vol[:, 0, :] = vol[:, -1, :] = step
    vol[:, :, 0] = vol[:, :, -1] = step
    verts, faces, _, _ = marching_cubes(vol, level=0.0, spacing=(step, step, step))
    verts = verts + lo
    # que las normales apunten hacia afuera (volumen positivo)
    tri = verts[faces]
    signed = np.einsum('ij,ij->i', tri[:, 0], np.cross(tri[:, 1], tri[:, 2])).sum() / 6.0
    if signed < 0:
        faces = faces[:, ::-1]
    return verts, faces


def mesh_stats(verts, faces):
    tri = verts[faces]
    vol = np.einsum('ij,ij->i', tri[:, 0], np.cross(tri[:, 1], tri[:, 2])).sum() / 6.0
    # malla cerrada: cada arista aparece exactamente dos veces
    e = np.sort(np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]), axis=1)
    _, counts = np.unique(e, axis=0, return_counts=True)
    return {
        'triangles': int(len(faces)),
        'volume_cm3': round(abs(vol) / 1000.0, 2),
        'size_mm': [round(float(v), 1) for v in verts.max(0) - verts.min(0)],
        'closed': bool(np.all(counts == 2)),
    }


def write_stl(path, verts, faces, name='robi'):
    tri = verts[faces].astype(np.float32)
    n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    data = np.zeros(len(faces), dtype=[('n', '<f4', 3), ('v', '<f4', (3, 3)), ('a', '<u2')])
    data['n'] = n
    data['v'] = tri
    with open(path, 'wb') as fh:
        fh.write(name.encode()[:80].ljust(80, b' '))
        fh.write(struct.pack('<I', len(faces)))
        fh.write(data.tobytes())


def place_on_bed(verts):
    """Apoya la pieza en la cama (z mínimo = 0) y la centra en x/y."""
    v = verts.copy()
    v[:, 2] -= v[:, 2].min()
    v[:, 0] -= (v[:, 0].max() + v[:, 0].min()) / 2
    v[:, 1] -= (v[:, 1].max() + v[:, 1].min()) / 2
    return v
