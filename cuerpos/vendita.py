"""VENDITA: momia petisa envuelta en vendas, con los brazos estirados, parada sobre su sarcófago.

Las vendas están modeladas en relieve. Si querés el efecto de tela de verdad, imprimí el cuerpo
y pegale encima gasa o tela cruda teñida con té: el relieve queda como guía.
"""
import numpy as np

import interfaz as I
from huesito import surco
from sdf import (bounded, box, capsule, cylinder, ellipsoid, intersect, rotate, smooth_union, smooth_union_all,
                 sphere, subtract, union)

RNG = np.random.default_rng(13)


def _vendas(base, n, alto, z0, z1, ancho=6.5, relieve=1.1, inclin=14.0, sesgo=(0, 0, 0)):
    """Vendas en relieve que envuelven `base` entre z0 y z1: bandas inclinadas al azar."""
    zs = np.linspace(z0, z1, n)
    bandas = []
    for z in zs:
        ang_x = RNG.uniform(-inclin, inclin)
        ang_y = RNG.uniform(-inclin, inclin)
        w = ancho * RNG.uniform(0.8, 1.15)
        losa = box((sesgo[0], sesgo[1], z), (400, 400, w), 0)
        losa = rotate(rotate(losa, 'x', ang_x, (0, 0, z)), 'y', ang_y, (0, 0, z))
        bandas.append(losa)
    capa = intersect(lambda p: base(p) - relieve, union(*bandas))
    # surcos finos entre venda y venda
    return smooth_union(base, capa, 0.6)


# ------------------------------------------------------------------ CABEZA (coordenadas de cabeza)

def cabeza_exterior():
    craneo = ellipsoid((0, 21, 4), (32, 31, 35))
    cara = box((0, 2, -8), (46, 22, 40), 11)
    forma = smooth_union(craneo, cara, 8)
    forma = _vendas(forma, 11, 70, -30, 36, ancho=6.0, relieve=1.2, inclin=16)
    # la venda suelta que cuelga del costado
    suelta = union(
        capsule((30, 10, 24), (38, 6, 14), 1.6),
        capsule((38, 6, 14), (40, 0, 2), 1.5),
        capsule((40, 0, 2), (39, -3, -8), 1.4),
    )
    suelta = intersect(suelta, box((38, 3, 8), (12, 3.2, 40)))  # aplastada como tela
    return smooth_union(forma, bounded(suelta, (26, -6, -12), (44, 14, 28)), 1.5)


def cabeza():
    ext = cabeza_exterior()
    pieza = I.cabeza_con_nucleo(ext, espesor=2.4)
    # ranura de los ojos más ancha que la ventana, como un hueco entre vendas
    hueco = box((0, -10, 0), (44, 16, 22), 6)
    return subtract(pieza, intersect(hueco, lambda p: -p[..., 1] - 0.5))


def nuca():
    return I.tapa_nuca(cabeza_exterior())


# ------------------------------------------------------------------ CUERPO (coordenadas de torso)

def torso_exterior():
    T = I.TORSO_ALTO
    hombros = box((0, 5, T - 12), (2 * I.HOMBRO_X, 32, 24), 9)
    cuerpo = ellipsoid((0, 4, 24), (24, 17, 30))
    pies = box((0, 2, 4), (46, 34, 8), 3.5)
    forma = smooth_union_all([hombros, cuerpo, pies], 8)
    forma = _vendas(forma, 9, T, 4, T - 4, ancho=7.0, relieve=1.0, inclin=12)
    return intersect(forma, lambda p: -p[..., 2])


def torso():
    return I.torso_con_servos(torso_exterior())


# ------------------------------------------------------------------ BRAZOS: estirados para adelante, como toda momia que se precie

def brazo_derecho():
    base = smooth_union_all([
        I.cubo_brazo(),
        capsule((8, 0, -1), (10, -16, -4), 5.2, 4.6),
        capsule((10, -16, -4), (10, -36, -3), 4.6, 4.0),
        ellipsoid((10, -40, -3), (4.6, 5.0, 3.4)),
        capsule((8, -43, -2), (7, -47, -3), 1.3),
        capsule((10.5, -44, -2), (10.5, -48.5, -3), 1.3),
        capsule((12.8, -43, -2), (13.5, -47, -3), 1.3),
    ], 2.0)
    # vendas alrededor del brazo: anillos inclinados a lo largo de y
    anillos = []
    for i, y in enumerate(np.arange(-6, -40, -5.5)):
        a = RNG.uniform(-18, 18)
        anillos.append(rotate(box((10, y, -3), (30, 4.4, 30)), 'z', a, (10, y, -3)))
    capa = intersect(lambda p: base(p) - 0.9, union(*anillos), lambda p: -(p[..., 0] - 2.5))
    return subtract(smooth_union(base, capa, 0.5), I.cubo_brazo_huecos())


def brazo_izquierdo():
    der = brazo_derecho()

    def f(p):
        q = p.copy()
        q[..., 0] = -q[..., 0]
        return der(q)

    return f


# ------------------------------------------------------------------ SARCÓFAGO (coordenadas de base)

def base_exterior():
    """Sarcófago: cofre de piedra con tapa en relieve, moldura dorada y jeroglíficos.
    Por fuera tiene la misma planta que la tumba de Huesito, así la tapa de abajo es la misma."""
    X, Y, Z = I.BASE_X, I.BASE_Y, I.BASE_Z
    cofre = box((0, 0, (Z - 6) / 2), (X, Y, Z - 6), 4)
    tapa = box((0, 0, Z - 4), (X - 2, Y - 2, 8), 3.5)
    tapa_centro = box((0, 0, Z - 1), (X - 22, Y - 20, 6), 6)
    moldura = box((0, 0, 12), (X + 2.4, Y + 2.4, 3.2), 1.5)
    forma = intersect(union(cofre, tapa, tapa_centro, moldura), lambda p: p[..., 2] - Z)
    # ankh grabado en el frente (al costado de la rejilla del parlante)
    ankh = union(
        capsule((34, -Y / 2, 17), (34, -Y / 2, 29), 1.3),
        capsule((29, -Y / 2, 29), (39, -Y / 2, 29), 1.3),
        subtract(ellipsoid((34, -Y / 2, 34), (3.6, 4, 4.6)), ellipsoid((34, -Y / 2, 34), (2.0, 5, 3.0))),
    )
    jeroglificos = union(*[
        capsule((-38 + dx, -Y / 2, 33 - dz), (-38 + dx + 4, -Y / 2, 33 - dz), 0.9)
        for dx, dz in [(0, 0), (6, 0), (0, 6), (6, 6), (3, 12), (0, 18), (6, 18)]
    ])
    marca = bounded(union(ankh, jeroglificos), (-42, -Y / 2 - 4, 12), (42, -Y / 2 + 4, 40))
    return subtract(forma, surco(forma, marca, 1.0))


def base():
    return I.base_con_electronica(base_exterior())


# ------------------------------------------------------------------ cajas límite

BBOX = {
    'cabeza': ((-46, -16, -34), (46, 54, 41)),
    'nuca': ((-28, 25, -17), (28, 56, 17)),
    'torso': ((-I.HOMBRO_X - 3, -18, 0), (I.HOMBRO_X + 3, 25, I.TORSO_ALTO + 1)),
    'brazo_derecho': ((-1, -52, -12), (18, 10, 10)),
    'brazo_izquierdo': ((-18, -52, -12), (1, 10, 10)),
    'base': ((-I.BASE_X / 2 - 1.5, -I.BASE_Y / 2 - 1.5, 0), (I.BASE_X / 2 + 1.5, I.BASE_Y / 2 + 1.5, I.BASE_Z)),
}
