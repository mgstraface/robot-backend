"""Pieza de prueba: placa con 3 huecos para el SG90 (holguras 0,15 / 0,25 / 0,35 mm por lado).
El servo entra de arriba y cuelga de las orejitas. 1, 2 o 3 puntitos marcan cada hueco.
Genera un STL cerrado (sólido) a partir de una grilla de celdas: sin librerías externas."""
import struct, sys
from itertools import product

# medidas del servo (calibre de Mati)
CUERPO_L, CUERPO_A = 22.9, 12.0
TORNILLOS = 27.8          # entre centros de los agujeros de las orejitas (SG90)
HOLGURAS = [0.15, 0.25, 0.35]
PASO, LARGO, ANCHO, ESP = 42.0, 126.0, 24.0, 2.4
PILOTO = 1.8              # agujero para tornillo M2 autorroscante
CABLE = (4.0, 1.0)        # muesca para el cable (ancho, profundidad)
PUNTO, ALTO_PUNTO = 2.0, 0.6

huecos, puntos = [], []
for i, c in enumerate(HOLGURAS):
    cx, cy = PASO / 2 + PASO * i, ANCHO / 2
    hx, hy = CUERPO_L / 2 + c, CUERPO_A / 2 + c
    huecos.append((cx - hx, cy - hy, cx + hx, cy + hy))
    huecos.append((cx - hx - CABLE[1], cy - CABLE[0] / 2, cx - hx, cy + CABLE[0] / 2))  # salida del cable
    for s in (-1, 1):
        tx = cx + s * TORNILLOS / 2
        huecos.append((tx - PILOTO / 2, cy - PILOTO / 2, tx + PILOTO / 2, cy + PILOTO / 2))
    for k in range(i + 1):  # 1, 2 o 3 puntitos arriba del hueco
        px = cx + (k - i / 2) * 4
        puntos.append((px - PUNTO / 2, ANCHO - 3.2 - PUNTO / 2, px + PUNTO / 2, ANCHO - 3.2 + PUNTO / 2))

xs = sorted({0.0, LARGO, *[v for r in huecos + puntos for v in (r[0], r[2])]})
ys = sorted({0.0, ANCHO, *[v for r in huecos + puntos for v in (r[1], r[3])]})
zs = [0.0, ESP, ESP + ALTO_PUNTO]

def dentro(r, x, y):
    return r[0] < x < r[2] and r[1] < y < r[3]

def lleno(i, j, k):
    if not (0 <= i < len(xs) - 1 and 0 <= j < len(ys) - 1 and 0 <= k < len(zs) - 1):
        return False
    x, y = (xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2
    if k == 0:
        return not any(dentro(r, x, y) for r in huecos)
    return any(dentro(r, x, y) for r in puntos)

tris = []
def quad(a, b, c, d):  # en orden antihorario visto desde afuera
    tris.append((a, b, c)); tris.append((a, c, d))

nx, ny, nz = len(xs) - 1, len(ys) - 1, len(zs) - 1
for i, j, k in product(range(nx), range(ny), range(nz)):
    if not lleno(i, j, k):
        continue
    x0, x1, y0, y1, z0, z1 = xs[i], xs[i + 1], ys[j], ys[j + 1], zs[k], zs[k + 1]
    if not lleno(i - 1, j, k): quad((x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0))
    if not lleno(i + 1, j, k): quad((x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1))
    if not lleno(i, j - 1, k): quad((x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1))
    if not lleno(i, j + 1, k): quad((x0, y1, z0), (x0, y1, z1), (x1, y1, z1), (x1, y1, z0))
    if not lleno(i, j, k - 1): quad((x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0))
    if not lleno(i, j, k + 1): quad((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))

# la grilla es común a todo, así que no hay uniones en T: cada arista la comparten 2 triángulos
from collections import Counter
aristas = Counter()
for t in tris:
    for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
        aristas[(a, b)] += 1
malas = sum(1 for (a, b), n in aristas.items() if n != 1 or aristas.get((b, a)) != 1)
print(f"{len(tris)} triángulos, aristas sin pareja: {malas}")
assert malas == 0, "el sólido no está cerrado"

out = sys.argv[1] if len(sys.argv) > 1 else "encastre_servo.stl"
with open(out, "wb") as f:
    f.write(b"Robi - prueba de encastre SG90".ljust(80, b" "))
    f.write(struct.pack("<I", len(tris)))
    for a, b, c in tris:
        u = [b[n] - a[n] for n in range(3)]; v = [c[n] - a[n] for n in range(3)]
        nrm = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
        f.write(struct.pack("<12fH", *nrm, *a, *b, *c, 0))
print("listo:", out)
