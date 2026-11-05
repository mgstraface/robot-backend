"""
Robi v3: CABEZA redondeada con CUELLO ESCONDIDO (sin la U a la vista).

Ejes: x a la derecha (mirando a Robi de frente), y hacia atrás (la cara mira a -y), z arriba.
Origen: centro del frente de la cabeza (y = 0 es la cara).

Cómo funciona el SÍ (cabeceo):
  - El servo del SÍ va adentro de la cabeza, atrás de la placa, como en la v2 pero corrido a la izquierda:
    su eje sale hacia la derecha (+x) y queda ADENTRO de la cabeza.
  - Adentro hay un "mecanismo" (pieza `mecanismo`): dos brazos internos pegados a las paredes + una barra que
    pasa por debajo del servo + el cuello, que sale por una ranura del piso de la cabeza.
      · brazo derecho: el bracito de 1 punta del servo (apuntando hacia ADELANTE) entra en su muesca.
      · brazo izquierdo: bisagra con un tornillo que entra desde afuera por la pared izquierda.
  - El mecanismo NO se mueve con el SÍ: está atornillado al collar, que va en el servo del NO.
    Cuando el servo del SÍ gira, lo que se mueve es la cabeza alrededor del mecanismo. Desde afuera se ve
    solo un cuello cortito y el collar redondo.
  - Al servo del SÍ hay que cortarle la orejita de ABAJO (la barra pasa por ahí).

Cómo funciona el NO (giro): el collar (pieza `collar`) va atornillado al bracito del servo del NO,
que está parado adentro del cuerpo. Al bracito del NO hay que cortarle la punta (que quede de 11 mm).
"""
import numpy as np

from medidas import HOLGURA as H
from sdf import box, cylinder, intersect, subtract, union

# ---------------------------------------------------------------- medidas (mm)
SERVO_L, SERVO_A = 22.9, 12.0          # cuerpo del SG90 (largo, ancho)
SERVO_CUERPO = 22.7                     # base a la tapa del cuerpo
SERVO_TORRE = 5.8                       # torre del engranaje
SERVO_OREJAS = 32.3
SERVO_OREJAS_ALTO = 15.9                # de la base a la orejita
SERVO_EJE_PUNTA = 5.9                   # el eje está a 5,9 mm de una punta del cuerpo
OREJA_ESP = 2.5

PLACA_X, PLACA_Z, PLACA_Y = 44.8, 24.55, 6.6
VISOR_X, VISOR_Z = 32.93, 17.75
CABLES_ATRAS = 8.0                      # pines + cables soldados detrás de la placa (el servo apoya ahí)
FRENTE = 1.6
PARED = 2.0

# bracito de 1 punta (medido): centro Ø7,7 y 3,0 de alto con rampita; brazo 1,9 de espesor
HORN_PROF = 1.9 + H + 0.1
HUB_PROF = 3.0 + H + 0.1
HUB = 7.7 + 2 * H + 0.3
RAMPA = 9.0 - 7.2 / 2 + H + 0.25
HORN_L = 18.5                           # del centro a la punta (17,7 medido)
HORN_W = 7.2
HORN_NO_L = 11.5                        # bracito del NO recortado (11 mm desde el centro)

# ---------------------------------------------------------------- ubicación del servo del SÍ
SERVO_Y0 = FRENTE + PLACA_Y + CABLES_ATRAS              # 16,2
EJE_Y = SERVO_Y0 + H + SERVO_A / 2                      # 22,35
EJE_Z = -(SERVO_L / 2 - SERVO_EJE_PUNTA)                # -5,55 (cuerpo del servo centrado en z = 0)
TORRE_X = 19.4                                          # punta de la torre del engranaje
TAPA_SERVO_X = TORRE_X - SERVO_TORRE                    # 13,6
BASE_SERVO_X = TAPA_SERVO_X - SERVO_CUERPO              # -9,1
OREJA_X = BASE_SERVO_X + SERVO_OREJAS_ALTO              # 6,8 (cara de la orejita del lado de la base)
SERVO_Z0, SERVO_Z1 = -SERVO_L / 2, SERVO_L / 2          # -11,45 .. 11,45
OREJA_Z1 = SERVO_OREJAS / 2                             # 16,15

# ---------------------------------------------------------------- mecanismo (brazos internos + barra + cuello)
BRI_X0 = TORRE_X + 3.4                                  # cara de adentro del brazo derecho (igual que en la U)
BRI_X1 = BRI_X0 + 5.0                                   # 27,8
BLI_X0, BLI_X1 = -BRI_X1, -BRI_X1 + 3.5                 # brazo izquierdo -27,8 .. -24,3
BARRA_W = 7.0                                           # ancho (en y)
BARRA_Z1 = EJE_Z - 9.4                                  # arriba de la barra (-14,95): esquiva la punta del servo
BARRA_Z0 = BARRA_Z1 - 3.0                               # -17,95
CUELLO_R = 4.0
SI_MAX = 18.0                                           # grados de cabeceo para cada lado (firmware: ±18)

# ---------------------------------------------------------------- cabeza
INT_X = BRI_X1 + 0.5                                    # 28,3
EXT_X = INT_X + PARED                                   # 30,3 → cabeza de 60,6 mm
INT_Z1 = OREJA_Z1 + 0.35                                # 16,5
EXT_Z1 = INT_Z1 + PARED                                 # 18,5
INT_Z0 = -5.55 - 13.25                                  # -18,8: la barra barre hasta -18,45
EXT_Z0 = INT_Z0 - PARED                                 # -20,8
FONDO = SERVO_Y0 + SERVO_A + 2 * H + 3.0                # 31,5: atrás del servo queda lugar para el cable
TAPA_ESP = 5.0                                          # la tapa es una "cúpula" redondeada de 5 mm
ATRAS = FONDO + TAPA_ESP                                # 36,5
R_ARRIBA, R_ABAJO = 13.0, 6.0                           # redondeo visto de frente
R_CARA = 2.5                                            # borde de la cara (chico: la placa no asoma)
R_ATRAS = 5.0

# collar (en el servo del NO)
COLLAR_R = 12.5
COLLAR_Z1 = -26.3                                       # arriba del collar (la cara, al asentir, baja hasta ~-25,5)
COLLAR_Z0 = COLLAR_Z1 - 4.5                             # -30,8
TACO = 7.0                                              # taco cuadrado del collar que entra en el cuello

# torres de los tornillos de la tapa (arriba, colgadas del techo)
TORRES = ((-16.8, 14.0), (16.8, 14.0))


# ================================================================ formas redondeadas
def rrect(u, v, u0, u1, v0, v1, r_u0v0, r_u0v1, r_u1v0, r_u1v1):
    """Rectángulo 2D con un radio distinto en cada esquina (SDF)."""
    cu, cv = (u0 + u1) / 2, (v0 + v1) / 2
    bu, bv = (u1 - u0) / 2, (v1 - v0) / 2
    pu, pv = u - cu, v - cv
    r = np.where(pu > 0, np.where(pv > 0, r_u1v1, r_u1v0), np.where(pv > 0, r_u0v1, r_u0v0))
    qu = np.abs(pu) - bu + r
    qv = np.abs(pv) - bv + r
    return np.minimum(np.maximum(qu, qv), 0) + np.sqrt(np.maximum(qu, 0) ** 2 + np.maximum(qv, 0) ** 2) - r


def bloque(x, y, z, r=0.0):
    return box(((x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2),
               (x[1] - x[0], y[1] - y[0], z[1] - z[0]), r)


def forma(x, y, z, frente, lado, arriba):
    """Intersección de tres perfiles redondeados (de frente, de costado y desde arriba).
    frente = (r abajo, r arriba) en x-z · lado = (r cara-abajo, r cara-arriba, r atrás-abajo, r atrás-arriba) en y-z
    arriba = (r cara, r atrás) en x-y."""
    def f(p):
        X, Y, Z = p[..., 0], p[..., 1], p[..., 2]
        a = rrect(X, Z, x[0], x[1], z[0], z[1], frente[0], frente[1], frente[0], frente[1])
        b = rrect(Y, Z, y[0], y[1], z[0], z[1], lado[0], lado[1], lado[2], lado[3])
        c = rrect(X, Y, x[0], x[1], y[0], y[1], arriba[0], arriba[1], arriba[0], arriba[1])
        return np.maximum(np.maximum(a, b), c)
    return f


def exterior():
    return forma((-EXT_X, EXT_X), (0, ATRAS), (EXT_Z0, EXT_Z1), (R_ABAJO, R_ARRIBA),
                 (R_CARA, R_CARA, R_ATRAS, R_ATRAS), (R_CARA, R_ATRAS))


def interior():
    return forma((-INT_X, INT_X), (FRENTE, ATRAS - PARED), (INT_Z0, INT_Z1),
                 (R_ABAJO - PARED, R_ARRIBA - PARED), (0.5, 0.5, R_ATRAS - PARED, R_ATRAS - PARED),
                 (0.5, R_ATRAS - PARED))


# ================================================================ CABEZA: FRENTE (se imprime con la cara abajo)
def cabeza_frente():
    ext, hueco = exterior(), interior()
    s = intersect(subtract(ext, hueco), bloque((-50, 50), (-5, FONDO), (-50, 50)))

    # ventana de la pantalla
    s = subtract(s, box((0, FRENTE / 2, 0), (VISOR_X + 0.8, FRENTE + 2, VISOR_Z + 0.8), 2.0))
    # guías de la placa (las de abajo a la derecha no: por ahí pasa el brazo derecho del mecanismo)
    px, pz = PLACA_X / 2 + H, PLACA_Z / 2 + H
    gy = (FRENTE, FRENTE + PLACA_Y)
    s = union(s, bloque((-px - 2.0, -px), gy, (pz - 6.5, pz)), bloque((-px - 2.0, -px), gy, (-pz, -pz + 6.5)),
              bloque((px, px + 2.0), gy, (pz - 6.5, pz)),
              bloque((-px, -px + 7.0), gy, (pz, pz + 2.0)), bloque((-px, -px + 7.0), gy, (-pz - 2.0, -pz)),
              bloque((px - 7.0, px), gy, (pz, pz + 2.0)), bloque((px - 9.0, px - 1.5), gy, (-pz - 2.0, -pz)))
    # USB-C de la placa (costado izquierdo), por si hay que cargarle el programa por cable
    s = subtract(s, box((-EXT_X, FRENTE + 6.5, 0), (8, 7.5, 12.5), 2.0))

    # servo del SÍ: nervio arriba (del lado de la base de la orejita de arriba) + tope arriba de la torre
    s = union(s, bloque((OREJA_X - 2.0, OREJA_X), (SERVO_Y0 + H, FONDO), (SERVO_Z1 + H, INT_Z1 + 0.5)))
    s = union(s, bloque((TAPA_SERVO_X + H, TAPA_SERVO_X + 2.0), (SERVO_Y0 + H, FONDO), (1.5, INT_Z1 + 0.5)))

    # torres de los tornillos de la tapa (colgadas del techo, atrás de la placa)
    for x, z in TORRES:
        t = union(cylinder((x, (SERVO_Y0 + 1 + FONDO) / 2, z), 2.2, FONDO - SERVO_Y0 - 1, axis='y'),
                  bloque((x - 2.2, x + 2.2), (SERVO_Y0 + 1, FONDO), (z, INT_Z1 + 0.5)))
        s = union(s, intersect(t, offset_in(hueco, -0.2)))
        s = subtract(s, cylinder((x, FONDO - 4, z), 0.85, 9, axis='y'))

    # piso: ranura para el cuello (abierta hacia atrás, para meter el mecanismo) + paso de cables a la izquierda
    s = subtract(s, bloque((-CUELLO_R - 0.45, CUELLO_R + 0.45), (EJE_Y - 9.2, FONDO + 1), (EXT_Z0 - 1, INT_Z0 + 0.5), 1.0))
    s = subtract(s, bloque((-11.5, 0), (EJE_Y - 6.0, FONDO + 1), (EXT_Z0 - 1, INT_Z0 + 0.5), 1.5))

    # bisagra izquierda: agujero para el tornillo (con rebaje afuera) · del otro lado un rebaje igual, de adorno
    s = subtract(s, cylinder((-EXT_X, EJE_Y, EJE_Z), 1.15, 2 * PARED + 2, axis='x'))
    s = subtract(s, cylinder((-EXT_X, EJE_Y, EJE_Z), 2.4, 2.4, axis='x'))
    s = subtract(s, cylinder((EXT_X, EJE_Y, EJE_Z), 2.4, 1.6, axis='x'))
    return s


def offset_in(f, d):
    return lambda p: f(p) - d


def girar(f, ang):
    """La forma f girada `ang` grados alrededor del eje del SÍ."""
    a = np.radians(ang)
    co, si = np.cos(a), np.sin(a)

    def g(p):
        q = p.copy()
        y, z = p[..., 1] - EJE_Y, p[..., 2] - EJE_Z
        q[..., 1] = co * y + si * z + EJE_Y
        q[..., 2] = -si * y + co * z + EJE_Z
        return f(q)
    return g


# ================================================================ CABEZA: TAPA (cúpula, se imprime boca abajo)
def cabeza_tapa():
    ext, hueco = exterior(), interior()
    s = intersect(subtract(ext, hueco), bloque((-50, 50), (FONDO, ATRAS + 1), (-50, 50)))
    # pestaña que entra en la cabeza y la centra
    lab = intersect(subtract(offset_in(hueco, H), offset_in(hueco, H + 1.2)), bloque((-50, 50), (FONDO - 2.0, FONDO + 0.5), (-50, 50)))
    # (la pestaña no pasa por donde están el nervio, el tope, las torres, la ranura del cuello ni los brazos internos)
    lab = subtract(lab, bloque((OREJA_X - 2.4, TAPA_SERVO_X + 2.4), (FONDO - 3, FONDO + 1), (1.0, 30)))
    lab = subtract(lab, bloque((-12, CUELLO_R + 1), (FONDO - 3, FONDO + 1), (-30, INT_Z0 + 3)))
    lab = subtract(lab, bloque((BRI_X0 - 1, 40), (FONDO - 3, FONDO + 1), (-30, 30)))
    lab = subtract(lab, bloque((-40, BLI_X1 + 1), (FONDO - 3, FONDO + 1), (-30, 30)))
    for x, z in TORRES:
        lab = subtract(lab, cylinder((x, FONDO, z), 3.0, 6, axis='y'))
    s = union(s, lab)
    # taco que empuja el servo hacia adelante (contra los pines de la placa)
    s = union(s, bloque((BASE_SERVO_X + 3, TAPA_SERVO_X - 2), (SERVO_Y0 + SERVO_A + 2 * H + 0.1, ATRAS - 1.0), (-6, 8), 0.8))
    # tornillos
    for x, z in TORRES:
        s = subtract(s, cylinder((x, FONDO + 2, z), 1.15, 12, axis='y'))
        s = subtract(s, cylinder((x, ATRAS, z), 2.3, 2 * (ATRAS - FONDO - 1.6), axis='y'))
    # rejilla de adorno / ventilación
    for z in (-6, 0, 6):
        s = subtract(s, box((0, ATRAS - 1, z), (16, 6, 2.0), 1.0))
    return s


# ================================================================ MECANISMO (brazos internos + barra + cuello)
def mecanismo():
    yb = (EJE_Y - BARRA_W / 2, EJE_Y + BARRA_W / 2)
    barra = bloque((BLI_X0, BRI_X1), yb, (BARRA_Z0, BARRA_Z1), 0.6)

    # brazo derecho: disco alrededor del eje + brazo hacia adelante (donde va el bracito) + bajada a la barra
    xr = (BRI_X0, BRI_X1)
    der = union(cylinder(((xr[0] + xr[1]) / 2, EJE_Y, EJE_Z), 6.5, xr[1] - xr[0], axis='x'),
                bloque(xr, (EJE_Y - HORN_L - 1.5, EJE_Y), (EJE_Z - 5.0, EJE_Z + 5.0), 2.0),
                bloque(xr, yb, (BARRA_Z0, EJE_Z), 0.6))
    # muesca del bracito: centro hondo + rampita + brazo (hacia adelante), y un canal abierto hacia atrás por donde
    # entra el centro del bracito cuando se mete el servo desde atrás
    hx = BRI_X0 + HUB_PROF / 2 - 0.01
    cx = BRI_X0 + HORN_PROF / 2 - 0.01
    der = subtract(der, cylinder((hx, EJE_Y, EJE_Z), HUB / 2, HUB_PROF, axis='x'),
                   box((hx, EJE_Y + 10, EJE_Z), (HUB_PROF, 20, HUB), 0),
                   box((hx, EJE_Y - RAMPA / 2, EJE_Z), (HUB_PROF, RAMPA, HUB), 0),
                   box((cx, EJE_Y - HORN_L / 2, EJE_Z), (HORN_PROF, HORN_L, HORN_W), 0))

    # brazo izquierdo (bisagra): disco + bajada; agujero para que el tornillo haga rosca
    xl = (BLI_X0, BLI_X1)
    izq = union(cylinder(((xl[0] + xl[1]) / 2, EJE_Y, EJE_Z), 5.5, xl[1] - xl[0], axis='x'),
                bloque(xl, yb, (BARRA_Z0, EJE_Z), 0.6))
    izq = subtract(izq, cylinder(((xl[0] + xl[1]) / 2, EJE_Y, EJE_Z), 0.85, 10, axis='x'))

    # cuello: baja de la barra, sale por la ranura del piso y llega casi al collar; abajo, hueco para el taco
    cuello = cylinder((0, EJE_Y, (BARRA_Z1 + COLLAR_Z1 + 0.1) / 2), CUELLO_R, BARRA_Z1 - COLLAR_Z1 - 0.1, rr=0.8)
    # lo de adentro se recorta para que entre en la cabeza en TODO el recorrido del SÍ (±SI_MAX)
    adentro = intersect(union(barra, der, izq), *[girar(offset_in(interior(), -0.45), ang)
                                                 for ang in np.linspace(-SI_MAX - 2, SI_MAX + 2, 9)])
    s = union(adentro, cuello)
    s = subtract(s, bloque((-TACO / 2 - H, TACO / 2 + H), (EJE_Y - TACO / 2 - H, EJE_Y + TACO / 2 + H),
                           (COLLAR_Z1 - 1, COLLAR_Z1 + 4.0 + 0.2)))
    # tornillo que traba el cuello con el taco del collar (entra desde atrás)
    s = subtract(s, cylinder((0, EJE_Y + 3, COLLAR_Z1 + 2.0), 1.15, 6, axis='y'))
    return s


# ================================================================ COLLAR (va en el bracito del servo del NO)
def collar():
    s = cylinder((0, EJE_Y, (COLLAR_Z0 + COLLAR_Z1) / 2), COLLAR_R, COLLAR_Z1 - COLLAR_Z0, rr=1.8)
    s = union(s, bloque((-TACO / 2, TACO / 2), (EJE_Y - TACO / 2, EJE_Y + TACO / 2), (COLLAR_Z1 - 1, COLLAR_Z1 + 4.0), 0.5))
    # bracito del NO (recortado a 11 mm) desde abajo, apuntando a +x
    z0 = COLLAR_Z0
    s = subtract(s, cylinder((0, EJE_Y, z0), HUB / 2, 2 * HUB_PROF, axis='z'),
                 box((RAMPA / 2, EJE_Y, z0), (RAMPA, HUB, 2 * HUB_PROF), 0),
                 box((HORN_NO_L / 2, EJE_Y, z0), (HORN_NO_L, HORN_W, 2 * HORN_PROF), 0))
    # tornillo central (entra desde arriba, antes de poner la cabeza) y tornillo que traba el cuello
    s = subtract(s, cylinder((0, EJE_Y, COLLAR_Z0), 1.3, 20))
    s = subtract(s, cylinder((0, EJE_Y, COLLAR_Z1 + 3.0), 2.5, 2 * (3.0 + 2.6)))
    s = subtract(s, cylinder((0, EJE_Y + 3, COLLAR_Z1 + 2.0), 0.85, 6, axis='y'))
    # agujero para los cables que bajan de la cabeza
    s = subtract(s, box((-8.0, EJE_Y, (COLLAR_Z0 + COLLAR_Z1) / 2), (5.5, 9.0, 10), 2.0))
    return s


BOUNDS_CABEZA = ((-EXT_X - 1, -1, EXT_Z0 - 1), (EXT_X + 1, FONDO + 1, EXT_Z1 + 1))
BOUNDS_TAPA = ((-EXT_X - 1, FONDO - 4, EXT_Z0 - 1), (EXT_X + 1, ATRAS + 1, EXT_Z1 + 1))
BOUNDS_MEC = ((BLI_X0 - 1, EJE_Y - HORN_L - 3, COLLAR_Z1 - 1), (BRI_X1 + 1, EJE_Y + 8, EJE_Z + 8))
BOUNDS_COLLAR = ((-COLLAR_R - 1, EJE_Y - COLLAR_R - 1, COLLAR_Z0 - 1), (COLLAR_R + 1, EJE_Y + COLLAR_R + 1, COLLAR_Z1 + 5))

if __name__ == '__main__':
    print(f'cabeza {2*EXT_X:.1f} × {ATRAS:.1f} × {EXT_Z1-EXT_Z0:.1f} mm · eje SÍ y={EJE_Y:.2f} z={EJE_Z:.2f}')
    print(f'servo SÍ: base x={BASE_SERVO_X:.1f} orejita x={OREJA_X:.1f} torre x={TORRE_X:.1f}')
    print(f'mecanismo: brazos x {BLI_X0:.1f}..{BLI_X1:.1f} / {BRI_X0:.1f}..{BRI_X1:.1f}, barra z {BARRA_Z0:.2f}..{BARRA_Z1:.2f}')
    print(f'collar z {COLLAR_Z0:.1f}..{COLLAR_Z1:.1f} (r {COLLAR_R})')
