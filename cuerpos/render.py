"""
Render "realista" de las SDF por sphere tracing: sombras suaves, oclusión ambiental, brillo especular
y materiales emisivos (los ojos de la pantalla). Sirve para ver las piezas sin imprimirlas.
"""
import numpy as np
from PIL import Image


def _normalize(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)


class Obj:
    """Objeto de la escena: forma + material.

    color: (r,g,b) 0..1, o función p -> (N,3) para materiales que varían (ej. la pantalla con ojos).
    emissive: función p -> (N,3) con luz propia (o None).
    """

    def __init__(self, f, color, rough=0.6, emissive=None, bounds=None):
        self.f = f
        self.bounds = bounds  # (lo, hi) en coordenadas del mundo: acelera mucho el render
        self.color = color
        self.rough = rough
        self.emissive = emissive


def _box_dist(p, lo, hi):
    c = (lo + hi) / 2
    h = (hi - lo) / 2
    q = np.abs(p - c) - h
    return np.sqrt(np.sum(np.maximum(q, 0) ** 2, -1)) + np.minimum(np.max(q, -1), 0)


def _scene(objs, p):
    n = p.shape[0]
    best = np.full(n, np.inf)
    idx = np.zeros(n, dtype=int)
    for i, o in enumerate(objs):
        if o.bounds is None:
            d = o.f(p)
            m = d < best
        else:
            lo, hi = (np.asarray(b, float) for b in o.bounds)
            db = _box_dist(p, lo, hi)
            cand = db < np.minimum(best, 12.0)
            d = db.copy()
            if np.any(cand):
                d[cand] = o.f(p[cand])
            m = d < best
        best[m] = d[m]
        idx[m] = i
    return best, idx


def render(objs, path, cam=(160, -260, 140), target=(0, 0, 40), fov=28, size=(900, 900), ground=0.0,
           light=(-0.5, -0.8, 1.0), bg_top=(0.13, 0.12, 0.14), bg_bottom=(0.05, 0.05, 0.06), ss=1):
    W, H = size[0] * ss, size[1] * ss
    cam = np.asarray(cam, float)
    target = np.asarray(target, float)
    fwd = _normalize(target - cam)
    right = _normalize(np.cross(fwd, [0, 0, 1]))
    up = np.cross(right, fwd)
    tanf = np.tan(np.radians(fov) / 2)
    xs = (np.arange(W) + 0.5) / W * 2 - 1
    ys = 1 - (np.arange(H) + 0.5) / H * 2
    X, Y = np.meshgrid(xs * tanf * W / H, ys * tanf)
    dirs = _normalize(fwd + X[..., None] * right + Y[..., None] * up).reshape(-1, 3)
    N = dirs.shape[0]

    # suelo como un objeto más (gris oscuro mate)
    scene = list(objs) + [Obj(lambda p: p[..., 2] - ground, (0.16, 0.15, 0.16), rough=0.95)]

    t = np.full(N, 1.0)
    hit = np.zeros(N, bool)
    alive = np.ones(N, bool)
    tmax = np.linalg.norm(cam - target) * 4
    for _ in range(220):
        ids = np.nonzero(alive)[0]
        if not len(ids):
            break
        p = cam + dirs[ids] * t[ids, None]
        d, _ = _scene(scene, p)
        t[ids] += d * 0.9
        done = d < 0.02 + t[ids] * 2e-4
        hit[ids[done]] = True
        alive[ids[done]] = False
        alive[ids[t[ids] > tmax]] = False

    img = np.zeros((N, 3))
    # fondo con degradé
    yy = np.repeat(np.linspace(0, 1, H), W)
    img[:] = np.outer(1 - yy, bg_top) + np.outer(yy, bg_bottom)

    ids = np.nonzero(hit)[0]
    p = cam + dirs[ids] * t[ids, None]
    _, mat = _scene(scene, p)
    e = 0.05
    nrm = np.zeros_like(p)
    for k in range(3):
        dv = np.zeros(3)
        dv[k] = e
        nrm[:, k] = _scene(scene, p + dv)[0] - _scene(scene, p - dv)[0]
    nrm = _normalize(nrm)

    L = _normalize(np.asarray(light, float))
    # sombras suaves
    sh = np.ones(len(ids))
    st = np.full(len(ids), 0.6)
    o = p + nrm * 0.3
    for _ in range(48):
        h, _ = _scene(scene, o + L * st[:, None])
        sh = np.minimum(sh, np.clip(10 * h / st, 0, 1))
        st += np.clip(h, 0.4, 8.0)
    # oclusión ambiental
    ao = np.zeros(len(ids))
    for k in range(1, 6):
        dist = k * 1.6
        h, _ = _scene(scene, p + nrm * dist)
        ao += (dist - h) / (2 ** k)
    ao = np.clip(1 - ao * 0.18, 0, 1)

    col = np.zeros((len(ids), 3))
    emis = np.zeros((len(ids), 3))
    rough = np.zeros(len(ids))
    for mi, ob in enumerate(scene):
        m = mat == mi
        if not m.any():
            continue
        col[m] = ob.color(p[m]) if callable(ob.color) else ob.color
        rough[m] = ob.rough
        if ob.emissive is not None:
            emis[m] = ob.emissive(p[m])

    V = -dirs[ids]
    diff = np.clip(np.sum(nrm * L, -1), 0, 1) * sh
    fill = np.clip(np.sum(nrm * _normalize(np.array([0.7, -0.3, 0.4])), -1), 0, 1) * 0.28
    rim = np.clip(1 - np.sum(nrm * V, -1), 0, 1) ** 3 * 0.25
    Hh = _normalize(L + V)
    spec = np.clip(np.sum(nrm * Hh, -1), 0, 1) ** (8 + (1 - rough) * 120) * (1 - rough) * 0.9 * sh
    light_col = np.array([1.0, 0.95, 0.88])
    shaded = col * (0.22 * ao[:, None] + diff[:, None] * light_col + fill[:, None] * np.array([0.6, 0.7, 0.9]) * ao[:, None])
    shaded += spec[:, None] + rim[:, None] * col + emis
    # niebla suave con la distancia
    fog = np.clip((t[ids] - np.linalg.norm(cam - target)) / (tmax * 0.6), 0, 1)[:, None]
    shaded = shaded * (1 - fog) + img[ids] * fog
    img[ids] = shaded

    img = img.reshape(H, W, 3)
    img = img / (1 + img * 0.15)  # tone mapping suave
    img = np.clip(img, 0, 1) ** (1 / 2.2)
    out = Image.fromarray((img * 255).astype(np.uint8))
    if ss > 1:
        out = out.resize(size, Image.LANCZOS)
    out.save(path)
    return path
