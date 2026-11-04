"""HUESITO: calavera con la pantalla en las cuencas, mandíbula aparte, costillas, brazos de hueso y su tumba."""
import numpy as np

import interfaz as I
import nucleo as N
from sdf import (bounded, box, capsule, cylinder, ellipsoid, everything, intersect, mirror_x, offset, rotate,
                 smooth_subtract, smooth_union, smooth_union_all, sphere, subtract, torus, translate, union, halfspace)

# ------------------------------------------------------------------ utilidades de modelado


def ring(c, a, b, r):
    """Anillo elíptico horizontal (costilla): semiejes a (x) y b (y), grosor r."""
    c = np.asarray(c, float)

    def f(p):
        q = p - c
        k = np.sqrt((q[..., 0] / a) ** 2 + (q[..., 1] / b) ** 2)
        d2 = (k - 1.0) * min(a, b)
        return np.sqrt(d2 * d2 + q[..., 2] ** 2) - r

    return f


def surco(solido, forma, prof):
    """Grabado: la parte de `forma` que está a menos de `prof` de la superficie de `solido`."""
    return intersect(forma, lambda p: -(solido(p) + prof))


def triangulo_xz(a, b, c, y0, y1):
    """Prisma triangular a lo largo de y (para la nariz)."""
    pts = [np.asarray(v, float) for v in (a, b, c)]
    planos = []
    for i in range(3):
        p0, p1 = pts[i], pts[(i + 1) % 3]
        e = p1 - p0
        n = np.array([e[1], -e[0]])
        n /= np.linalg.norm(n)
        centro = sum(pts) / 3
        if np.dot(centro - p0, n) > 0:
            n = -n
        planos.append((n, np.dot(n, p0)))

    def f(p):
        xz = np.stack([p[..., 0], p[..., 2]], -1)
        d = np.maximum(p[..., 1] - y1, y0 - p[..., 1])
        for n, o in planos:
            d = np.maximum(d, xz @ n - o)
        return d

    return f


# ------------------------------------------------------------------ CALAVERA (coordenadas de cabeza)


def craneo_exterior():
    craneo = ellipsoid((0, 23, 4), (33, 32, 34))
    maxilar = box((0, 6, -19), (42, 26, 22), 9)
    pomulos = union(ellipsoid((25, 2, -6), (8, 11, 7)), ellipsoid((-25, 2, -6), (8, 11, 7)))
    ceja = union(capsule((-23, -1, 12), (0, -5, 15.5), 4.2), capsule((23, -1, 12), (0, -5, 15.5), 4.2))
    forma = smooth_union_all([craneo, maxilar, pomulos, ceja], 6)
    # cuencas: hundidas alrededor de la ventana de la pantalla
    cuencas = union(ellipsoid((12.5, -8, 0), (14, 9, 12)), ellipsoid((-12.5, -8, 0), (14, 9, 12)))
    forma = smooth_subtract(forma, cuencas, 3)
    # sienes
    sienes = union(ellipsoid((35, 14, -1), (6, 15, 12)), ellipsoid((-35, 14, -1), (6, 15, 12)))
    forma = smooth_subtract(forma, sienes, 4)
    # dientes de arriba
    dientes = bounded(union(*[
        box((x, -6.5 + (x / 18) ** 2 * 9, -31.5), (3.3, 4.2, 5.2), 1.2) for x in np.arange(-14, 14.1, 4)
    ]), (-16, -10, -35), (16, 2, -28))
    forma = smooth_union(forma, dientes, 0.8)
    # bisagras de la mandíbula (agujero para un pedazo de filamento de 1,75 mm)
    bisagras = union(cylinder((20.5, 4, -22), 4.6, 4.0, 'x', rr=1), cylinder((-20.5, 4, -22), 4.6, 4.0, 'x', rr=1))
    return union(forma, bisagras)


def craneo():
    ext = craneo_exterior()
    pieza = I.cabeza_con_nucleo(ext, espesor=2.4)
    nariz = triangulo_xz((0, -6), (-5.5, -17), (5.5, -17), -30, 14)
    grietas = surco(ext, union(
        rotate(box((11, 18, 37), (0.9, 18, 6)), 'z', 28, (11, 18, 37)),
        rotate(box((16, 12, 33), (0.8, 10, 6)), 'z', -35, (16, 12, 33)),
        rotate(box((-18, 30, 30), (0.9, 14, 8)), 'z', 15, (-18, 30, 30)),
    ), 1.0)
    pasador = intersect(cylinder((0, 4, -22), 0.95, 60, 'x'), lambda p: 17.5 - np.abs(p[..., 0]))
    return subtract(pieza, nariz, grietas, pasador)


def nuca():
    return I.tapa_nuca(craneo_exterior())


def mandibula():
    lado = union(
        capsule((24.5, 4, -22), (22, 3, -34), 4.0),
        capsule((22, 3, -34), (9, -8, -39), 3.8),
        cylinder((24.5, 4, -22), 4.4, 4.0, 'x', rr=1),
    )
    hueso = smooth_union(mirror_x(lado), ellipsoid((0, -9.5, -39), (10, 6, 5)), 3)
    dientes = union(*[
        box((x, -7 + (x / 18) ** 2 * 9, -34), (3.1, 3.8, 4.2), 1.1) for x in np.arange(-12, 12.1, 4)
    ])
    pasador = cylinder((0, 4, -22), 0.95, 60, 'x')
    return subtract(smooth_union(hueso, dientes, 0.8), pasador)


# ------------------------------------------------------------------ COSTILLAS (coordenadas de torso)

def torso_exterior():
    T = I.TORSO_ALTO
    hombros = box((0, 5, T - 12), (2 * I.HOMBRO_X, 30, 24), 6)
    centro = ellipsoid((0, 5, 22), (18, 13, 24))
    pelvis = box((0, 4, 4.5), (44, 28, 9), 3.5)
    columna = union(capsule((0, 17, 4), (0, 17, T - 4), 4.2), *[sphere((0, 18.5, z), 5.2) for z in np.arange(8, T - 6, 7)])
    costillas = union(*[ring((0, 4, z), 24 - 1.2 * i, 15.5 - 0.3 * i, 2.5) for i, z in enumerate((34, 27, 20, 13))])
    costillas = subtract(costillas, box((0, -16, 22), (7, 10, 40)))  # el esternón tapa el frente
    esternon = capsule((0, -11.5, 12), (0, -12.5, 36), 3.4)
    claviculas = union(capsule((0, -9, 44), (20, -2, 49), 2.8), capsule((0, -9, 44), (-20, -2, 49), 2.8))
    forma = smooth_union_all([hombros, centro, pelvis, columna], 4)
    forma = smooth_union_all([forma, costillas, esternon, claviculas], 2.0)
    # que la base quede plana para imprimir y apoyar
    return intersect(forma, lambda p: -p[..., 2])


def torso():
    return I.torso_con_servos(torso_exterior())


# ------------------------------------------------------------------ BRAZOS (coordenadas de brazo: eje del servo en el origen, lado derecho)

def brazo_derecho():
    huesos = smooth_union_all([
        I.cubo_brazo(),
        sphere((8, 0, -1), 4.6),
        capsule((8, 0, -1), (11.5, -2, -26), 3.0),
        sphere((11.5, -2, -26), 3.9),
        capsule((11, -2, -26), (10, -20, -33), 1.9),
        capsule((12.5, -1.5, -27), (12.5, -19, -35), 1.7),
        ellipsoid((11.5, -22.5, -35), (4.2, 3.4, 2.6)),
        capsule((9.5, -24, -35), (8.2, -30, -38), 1.1),
        capsule((11.2, -25, -35), (11, -31.5, -38.5), 1.1),
        capsule((13, -24.5, -35), (14, -30.5, -38), 1.1),
        capsule((14.5, -22, -35), (17, -26, -37), 1.1),
    ], 1.4)
    return subtract(huesos, I.cubo_brazo_huecos())


def brazo_izquierdo():
    der = brazo_derecho()

    def f(p):
        q = p.copy()
        q[..., 0] = -q[..., 0]
        return der(q)

    return f


# ------------------------------------------------------------------ TUMBA (coordenadas de base)

LAPIDA_Y = I.BASE_Y / 2 - 12.0
LAPIDA = dict(ancho=78.0, prof=14.0, alto=70.0)


def base_exterior():
    forma = box((0, 0, I.BASE_Z / 2), (I.BASE_X, I.BASE_Y, I.BASE_Z), 5)
    # bloques de piedra: surcos horizontales y verticales salteados
    s = []
    for z in (15.5, 31):
        s.append(box((0, 0, z), (I.BASE_X + 2, I.BASE_Y + 2, 1.4)))
    for i, x in enumerate(np.arange(-I.BASE_X / 2 + 13, I.BASE_X / 2, 26)):
        for row, (z0, z1) in enumerate([(0, 15.5), (15.5, 31), (31, I.BASE_Z)]):
            xx = x + (13 if row % 2 else 0)
            if abs(xx) < I.BASE_X / 2 - 3:
                s.append(box((xx, -I.BASE_Y / 2, (z0 + z1) / 2), (1.4, 4, z1 - z0)))
                s.append(box((xx, I.BASE_Y / 2, (z0 + z1) / 2), (1.4, 4, z1 - z0)))
    return subtract(forma, surco(forma, union(*s), 0.9))


def base():
    pieza = I.base_con_electronica(base_exterior())
    clavijas = union(*[cylinder((x, LAPIDA_Y, I.BASE_Z - 3), 3.4, 8, 'z') for x in (-24, 24)])
    return subtract(pieza, clavijas)


def _letras(x0, z0, y):
    """Q.E.P.D. grabado con trazos (alto 10 mm)."""
    t = []
    r = 0.95
    # Q
    t.append(torus((x0 + 3.5, y, z0 + 5), 3.6, r, 'y'))
    t.append(capsule((x0 + 4.5, y, z0 + 2), (x0 + 7, y, z0 - 0.5), r))
    t.append(sphere((x0 + 9.3, y, z0 + 0.5), 1.1))
    # E
    x = x0 + 11.5
    t += [capsule((x, y, z0 + 1.2), (x, y, z0 + 8.8), r), capsule((x, y, z0 + 8.8), (x + 5.5, y, z0 + 8.8), r),
          capsule((x, y, z0 + 5), (x + 4.5, y, z0 + 5), r), capsule((x, y, z0 + 1.2), (x + 5.5, y, z0 + 1.2), r)]
    t.append(sphere((x + 8, y, z0 + 0.5), 1.1))
    # P
    x = x0 + 22
    t += [capsule((x, y, z0 + 1.2), (x, y, z0 + 8.8), r), capsule((x, y, z0 + 8.8), (x + 2.6, y, z0 + 8.8), r),
          capsule((x, y, z0 + 4.8), (x + 2.6, y, z0 + 4.8), r),
          intersect(torus((x + 2.6, y, z0 + 6.8), 2.0, r, 'y'), lambda p: (x + 2.6) - p[..., 0])]
    t.append(sphere((x + 8, y, z0 + 0.5), 1.1))
    # D
    x = x0 + 32.5
    t += [capsule((x, y, z0 + 1.2), (x, y, z0 + 8.8), r), capsule((x, y, z0 + 8.8), (x + 1.5, y, z0 + 8.8), r),
          capsule((x, y, z0 + 1.2), (x + 1.5, y, z0 + 1.2), r),
          intersect(torus((x + 1.5, y, z0 + 5), 3.8, r, 'y'), lambda p: (x + 1.5) - p[..., 0])]
    t.append(sphere((x + 8.5, y, z0 + 0.5), 1.1))
    return union(*t)


def lapida():
    a, pr, al = LAPIDA['ancho'], LAPIDA['prof'], LAPIDA['alto']
    cuerpo = union(
        box((0, LAPIDA_Y, al / 2 - a / 4), (a, pr, al - a / 2), 2.5),
        intersect(cylinder((0, LAPIDA_Y, al - a / 2), a / 2, pr, 'y', rr=2.5), lambda p: (al - a / 2) - p[..., 2]),
    )
    cuerpo = translate(cuerpo, (0, 0, I.BASE_Z))
    frente = LAPIDA_Y - pr / 2
    texto = bounded(_letras(-21.5, I.BASE_Z + 30, frente), (-24, frente - 2, I.BASE_Z + 27), (24, frente + 2, I.BASE_Z + 42))
    cruz = union(capsule((0, frente, I.BASE_Z + 46), (0, frente, I.BASE_Z + 62), 1.3),
                 capsule((-5.5, frente, I.BASE_Z + 57), (5.5, frente, I.BASE_Z + 57), 1.3))
    grieta = surco(cuerpo, union(rotate(box((22, frente, I.BASE_Z + 50), (1.0, 4, 22)), 'y', 25, (22, frente, I.BASE_Z + 50)),
                                 rotate(box((27, frente, I.BASE_Z + 38), (0.8, 4, 10)), 'y', -30, (27, frente, I.BASE_Z + 38))), 1.2)
    # mordiscos del tiempo en los bordes
    gastes = union(sphere((a / 2, LAPIDA_Y - 5, I.BASE_Z + 22), 3.5), sphere((-a / 2 + 1, LAPIDA_Y + 4, I.BASE_Z + 40), 3),
                   sphere((-14, LAPIDA_Y - pr / 2, I.BASE_Z + al - 3), 3.2))
    clavijas = union(*[cylinder((x, LAPIDA_Y, I.BASE_Z - 2.5), 3.0, 6, 'z', rr=0.6) for x in (-24, 24)])
    return union(subtract(cuerpo, surco(cuerpo, union(texto, cruz), 1.1), grieta, gastes), clavijas)


# ------------------------------------------------------------------ cajas límite (para mallar)

BBOX = {
    'craneo': ((-36, -16, -34), (36, 57, 41)),
    'nuca': ((-28, 25, -17), (28, 57, 17)),
    'mandibula': ((-30, -18, -46), (30, 10, -16)),
    'torso': ((-I.HOMBRO_X - 2, -18, 0), (I.HOMBRO_X + 2, 25, I.TORSO_ALTO + 1)),
    'brazo_derecho': ((-1, -34, -42), (21, 10, 10)),
    'brazo_izquierdo': ((-21, -34, -42), (1, 10, 10)),
    'base': ((-I.BASE_X / 2, -I.BASE_Y / 2, 0), (I.BASE_X / 2, I.BASE_Y / 2, I.BASE_Z)),
    'lapida': ((-41, LAPIDA_Y - 9, I.BASE_Z - 6), (41, LAPIDA_Y + 9, I.BASE_Z + LAPIDA['alto'] + 1)),
}
