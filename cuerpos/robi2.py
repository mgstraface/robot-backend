"""
Robi v2 (cabeza = pantalla): CABEZA (frente + tapa) y CUELLO en U.

Ejes: x a la derecha (mirando a Robi de frente), y hacia atrás (la cara mira a -y), z arriba.
Origen: centro del frente de la cabeza (y = 0 es la cara).

Cómo funciona:
  - La placa va pegada a la ventana del frente.
  - El servo del SÍ va adentro, atrás de la placa, acostado: su eje sale por la pared derecha (+x).
    Se mete por atrás deslizándolo en una ranura (no lleva tornillos: la tapa lo deja trabado).
  - La U abraza la cabeza: el brazo derecho lleva pegado el bracito blanco del servo; el izquierdo
    tiene un tornillo-bisagra que entra en la cabeza. Cuando el servo gira, la cabeza asiente.
  - Abajo, la U se pega al bracito de 2 puntas del servo del NO (que va parado en el pecho).
"""
import numpy as np

from medidas import HOLGURA as H
from sdf import box, cylinder, intersect, subtract, union

# ---------------- medidas (mm)
SERVO_L, SERVO_A = 22.9, 12.0          # cuerpo del SG90 (largo, ancho)
SERVO_CUERPO = 22.7                     # base a la tapa del cuerpo
SERVO_TORRE = 5.8                       # torre del engranaje
SERVO_EJE_SALE = 3.2                    # lo que sale el eje sobre la torre
SERVO_OREJAS = 32.3
SERVO_OREJAS_ALTO = 15.9                # de la base a la orejita
SERVO_EJE_PUNTA = 5.9                   # el eje está a 5,9 mm de una punta del cuerpo

PLACA_X, PLACA_Z, PLACA_Y = 44.8, 24.55, 6.6   # largo medido (Mati 3/11); el USB asoma ~1 mm más
VISOR_X, VISOR_Z = 32.93, 17.75
CABLES_ATRAS = 8.0                      # pines + cables soldados detrás de la placa

PARED = 2.0
FRENTE = 1.6
R_CAB = 8.0                             # redondeo de la cabeza (vista de frente)
R_FRENTE = 2.5                          # redondeo del borde de la cara

# cabeza
INT_X = 24.0                            # medio ancho interior (la torre del servo apoya en x = +24)
EXT_X = INT_X + PARED                   # 26 → cabeza de 52 mm
INT_Z = SERVO_OREJAS / 2 + H + 0.2      # orejitas del servo de punta a punta
EXT_Z = INT_Z + PARED                   # ≈ 18,5 → cabeza de 37 mm
SERVO_Y0 = FRENTE + PLACA_Y + CABLES_ATRAS   # el servo empieza acá (16,2)
EJE_Y = SERVO_Y0 + H + SERVO_A / 2           # eje del SÍ (centro del ancho del servo)
FONDO = SERVO_Y0 + SERVO_A + 2 * H + 0.5     # interior hasta la tapa
TAPA = 2.0
EJE_Z = -(SERVO_L / 2 - SERVO_EJE_PUNTA)     # eje un poco abajo del centro (−5,55)

# torres de la tapa: en la franja libre entre la placa y el techo/piso, del lado izquierdo
TORRE_R = 2.2
TORRES_Z = (-(PLACA_Z / 2 + H + TORRE_R + 0.25), PLACA_Z / 2 + H + TORRE_R + 0.25)
TORRE_TX = -19.0

# servo adentro (a lo largo de x)
TORRE_X = INT_X                          # la torre toca la pared interior derecha
TAPA_SERVO_X = TORRE_X - SERVO_TORRE
BASE_SERVO_X = TAPA_SERVO_X - SERVO_CUERPO
OREJA_X = BASE_SERVO_X + SERVO_OREJAS_ALTO  # cara de abajo de las orejitas
NERVIO = 2.0                             # nervio donde apoyan las orejitas

# U
GAP = 1.4                                # entre la cabeza y los brazos de la U
BRAZO = 5.0                              # (v1.3) era 4: con la muesca del centro más honda quedaba finito
BRAZO_IN = EXT_X + GAP
BRAZO_OUT = BRAZO_IN + BRAZO
BRAZO_Y = 10.0                           # ancho del brazo (en y)
BASE_TOP = -27.5                         # deja inclinar ±25° sin chocar
BASE_ESP = 5.5                           # (v1.3) era 4,5 (misma razón)
HORN_PROF = 1.9 + H + 0.1                # bracito blanco (1,9 mm) metido en la pieza
HUB_PROF = 3.0 + H + 0.1                 # (v1.3) el centro redondo del bracito tiene 3,0 mm (medido 4/11), no 1,9
HUB = 7.7 + 2 * H + 0.3                  # centro del bracito de 1 punta (7,7 medido)
HORN_L = 18.5                            # del centro a la punta (17,7 medido)
HORN_W = 7.2                             # ancho del brazo (con aire)
OREJA_R, OREJA_SALE = 6.0, 0.9           # "orejitas" redondas alrededor del eje: centran la cabeza en la U


def caja_redonda(cx, cy, cz, sx, sy, sz, r):
    return box((cx, cy, cz), (sx, sy, sz), r)


def placa_xz(cx, cy, cz, sx, sy, sz, r):
    """Rectángulo con esquinas redondeadas (en x-z) extruido en y, con caras planas (sirve para piezas finas)."""
    return intersect(box((cx, cy, cz), (sx, sy + 2 * r + 2, sz), r), box((cx, cy, cz), (sx + 2, sy, sz + 2)))


# ======================================================== CABEZA: FRENTE (se imprime con la cara abajo)
def cabeza_frente():
    alto = 2 * EXT_Z
    # caja redondeada que se corta atrás en y = FONDO (ahí apoya la tapa)
    # (v1.2) silueta redondeada vista de frente (r 8) pero el borde de la cara con redondeo chico (r 2,5):
    # con el redondeo grande, la placa de 44,8 mm asomaba por las esquinas del frente
    ext = intersect(placa_xz(0, FONDO / 2, 0, 2 * EXT_X, FONDO, alto, R_CAB),
                    box((0, FONDO / 2 + 5, 0), (2 * EXT_X, FONDO + 10, alto), R_FRENTE))
    hueco = placa_xz(0, (FRENTE + FONDO + 20) / 2, 0, 2 * INT_X, FONDO - FRENTE + 20, 2 * INT_Z, R_CAB - PARED)
    s = subtract(ext, hueco)

    # ventana de la pantalla
    s = subtract(s, placa_xz(0, FRENTE / 2, 0, VISOR_X + 0.8, FRENTE + 2, VISOR_Z + 0.8, 2.0))
    # guías de la placa (4 esquinas en L): la ubican; un poquito de pegamento la deja fija
    px, pz = PLACA_X / 2 + H, PLACA_Z / 2 + H
    for sx in (-1, 1):
        for sz in (-1, 1):
            g = box((sx * (px + 1.0), FRENTE + PLACA_Y / 2, sz * (pz - 3)), (2.0, PLACA_Y, 7), 0)
            g2 = box((sx * (px - 3), FRENTE + PLACA_Y / 2, sz * (pz + 1.0)), (7, PLACA_Y, 2.0), 0)
            s = union(s, g, g2)
    # USB-C de la placa (costado izquierdo), por si hay que cargarle el programa por cable
    s = subtract(s, box((-EXT_X, FRENTE + 6.5, 0), (8, 7.5, 12.5), 2.0))   # (v1.1) acostada, como el USB

    # nervio donde apoyan las orejitas del servo, con ranura abierta hacia atrás para el cuerpo
    nervio = box((OREJA_X - NERVIO / 2, (SERVO_Y0 + FONDO) / 2, 0), (NERVIO, FONDO - SERVO_Y0, 2 * INT_Z + 1), 0)
    # (v1.2.1) la ranura arranca 1 mm antes del nervio: antes empezaba en SERVO_Y0 + H y dejaba una lámina de
    # 0,15 mm cruzando de lado a lado que tapaba el paso de la placa
    ranura = box((OREJA_X - NERVIO / 2, (SERVO_Y0 - 1 + FONDO + 10) / 2, EJE_Z + SERVO_L / 2 - SERVO_EJE_PUNTA),
                 (NERVIO + 2, FONDO - SERVO_Y0 + 11, max(SERVO_L + 2 * H, PLACA_Z + 2 * H + 0.6)), 0)   # (v1.2) deja pasar la placa
    s = union(s, subtract(nervio, ranura))
    # topes: la torre del engranaje apoya en la pared derecha; agujero del eje + ranura para entrar
    s = subtract(s, cylinder((EXT_X - PARED / 2, EJE_Y, EJE_Z), 4.6, PARED + 2, axis='x'))
    s = subtract(s, box((EXT_X - PARED / 2, (EJE_Y + FONDO + 5) / 2, EJE_Z), (PARED + 2, FONDO - EJE_Y + 5, 5.4), 0))

    # bisagra izquierda: bulón con agujero para un tornillito (rosca en el plástico)
    # (v1.2) sin buje adentro: estorbaba al meter la placa. El tornillo-bisagra se enrosca en un pilar de la TAPA.
    s = subtract(s, cylinder((-EXT_X + 2.5, EJE_Y, EJE_Z), 0.85, 12, axis='x'))

    # 2 torres para los tornillos de la tapa (v1.2): arriba y abajo de la placa, pegadas al techo/piso y de punta
    # a punta (desde el frente): no estorban al meter la placa por atrás y se imprimen sin soportes
    for z in TORRES_Z:
        t = cylinder((TORRE_TX, (FRENTE + FONDO) / 2, z), TORRE_R, FONDO - FRENTE, axis='y')
        t = union(t, box((TORRE_TX, (FRENTE + FONDO) / 2, z + np.sign(z) * 1.6), (2 * TORRE_R, FONDO - FRENTE, 3.2), 0))
        s = union(s, t)
        s = subtract(s, cylinder((TORRE_TX, FONDO - 4, z), 0.85, 9, axis='y'))
    s = intersect(s, ext)   # nada de lo de adentro puede asomar por afuera
    # orejitas: aros redondos alrededor del eje, de los dos lados
    for sx in (-1, 1):
        o = cylinder((sx * (EXT_X + OREJA_SALE / 2 - 0.3), EJE_Y, EJE_Z), OREJA_R, OREJA_SALE + 0.6, axis='x')
        s = union(s, o)
    s = subtract(s, cylinder((EXT_X, EJE_Y, EJE_Z), 4.6, 2 * PARED + 4, axis='x'))   # paso del eje/bracito
    s = subtract(s, box((EXT_X, (EJE_Y + FONDO + 5) / 2, EJE_Z), (PARED + 4, FONDO - EJE_Y + 5, 5.4), 0))
    s = subtract(s, cylinder((-EXT_X, EJE_Y, EJE_Z), 1.15, 8, axis='x'))          # paso del tornillo-bisagra
    # salida de cables por abajo (cerca de atrás)
    s = subtract(s, box((-12, FONDO - 6, -EXT_Z), (9, 7, 6), 1.5))
    return s


# ======================================================== CABEZA: TAPA (se imprime plana)
def cabeza_tapa():
    ext = placa_xz(0, FONDO + TAPA / 2, 0, 2 * EXT_X, TAPA, 2 * EXT_Z, R_CAB)
    # pestaña interior que centra la tapa
    lab = placa_xz(0, FONDO - 1.0, 0, 2 * (INT_X - H), 2.0, 2 * (INT_Z - H), R_CAB - PARED)
    lab = subtract(lab, placa_xz(0, FONDO - 1.0, 0, 2 * (INT_X - H - 1.2), 3, 2 * (INT_Z - H - 1.2), R_CAB - PARED - 1))
    lab = intersect(lab, box((-30, FONDO, 0), (60, 10, 60)))  # solo del lado izquierdo (el derecho lo ocupa el servo)
    # pilar de la bisagra: entra en la cabeza pegado a la pared izquierda; ahí se enrosca el tornillo-bisagra
    # (además traba la tapa). Se imprime parado sobre la tapa, sin soportes.
    py0 = EJE_Y - 3.6
    pilar = box((-INT_X + H + 2.5, (py0 + FONDO + 0.5) / 2, EJE_Z), (5.0, FONDO + 0.5 - py0, 7.2), 1.0)
    s = union(ext, lab, pilar)
    s = subtract(s, cylinder((-INT_X + H + 2.5, EJE_Y, EJE_Z), 0.85, 6.0, axis='x'))
    # agujeros de los tornillos, con rebaje para la cabeza
    for z in TORRES_Z:
        s = subtract(s, cylinder((TORRE_TX, FONDO - 1, z), TORRE_R + 0.4, 3, axis='y'))   # la pestaña esquiva la torre
        s = subtract(s, box((TORRE_TX, FONDO - 1, z + np.sign(z) * 2), (2 * TORRE_R + 0.8, 3, 4), 0))
        s = subtract(s, cylinder((TORRE_TX, FONDO + 1, z), 1.15, 6, axis='y'))
        s = subtract(s, cylinder((TORRE_TX, FONDO + TAPA, z), 2.2, 2.0, axis='y'))
    # muesca para que la pestaña no choque con el nervio del servo ni con la ranura de salida de cables
    s = subtract(s, box((OREJA_X - NERVIO / 2, FONDO - 1, 0), (NERVIO + 2 * H + 0.4, 3, 2 * INT_Z + 2), 0))
    s = subtract(s, box((-12, FONDO - 1.5, -EXT_Z + 2), (9.5, 4, 5), 0))
    # rejilla de ventilación / decorado: 3 ranuras
    for z in (-6, 0, 6):
        s = subtract(s, box((8, FONDO + TAPA / 2, z), (14, TAPA + 2, 2.0), 1.0))
    return s


# ======================================================== CUELLO EN U (se imprime parado sobre la base)
def cuello_u():
    tope = EJE_Z + 7.0
    brazo_alto = tope - BASE_TOP
    brazos = []
    for sx in (-1, 1):
        cx = sx * (BRAZO_IN + BRAZO / 2)
        b = box((cx, EJE_Y, (BASE_TOP + tope) / 2 - 1), (BRAZO, BRAZO_Y, brazo_alto + 2), 1.2)
        b = union(b, cylinder((cx, EJE_Y, EJE_Z), BRAZO_Y / 2, BRAZO, axis='x', rr=1.0))
        b = intersect(b, box((cx, EJE_Y, (BASE_TOP - 2 + EJE_Z + BRAZO_Y / 2) / 2),
                             (BRAZO + 1, BRAZO_Y + 1, EJE_Z + BRAZO_Y / 2 - BASE_TOP + 2)))
        brazos.append(b)
    base = box((0, EJE_Y, BASE_TOP - BASE_ESP / 2), (2 * BRAZO_OUT, BRAZO_Y + 2, BASE_ESP), 1.5)
    s = union(base, *brazos)

    # brazo derecho: hueco para el bracito blanco de 1 punta (mirando hacia abajo) + agujero del tornillo central
    hx = BRAZO_IN + HORN_PROF / 2 - 0.01
    s = subtract(s, cylinder((BRAZO_IN + HUB_PROF / 2 - 0.01, EJE_Y, EJE_Z), HUB / 2, HUB_PROF, axis='x'))
    largo = HORN_L
    brazo_horn = box((hx, EJE_Y, EJE_Z - largo / 2), (HORN_PROF, HORN_W, largo), 0)
    s = subtract(s, brazo_horn)
    s = subtract(s, cylinder((BRAZO_IN + BRAZO / 2, EJE_Y, EJE_Z), 2.6, BRAZO + 2, axis='x'))

    # brazo izquierdo: agujero pasante para el tornillo-bisagra, con rebaje para la cabeza del tornillo
    cx = -(BRAZO_IN + BRAZO / 2)
    s = subtract(s, cylinder((cx, EJE_Y, EJE_Z), 1.15, BRAZO + 2, axis='x'))
    s = subtract(s, cylinder((-BRAZO_OUT, EJE_Y, EJE_Z), 2.3, 5.0, axis='x'))

    # abajo: hueco para el bracito de 2 puntas del servo del NO (a lo largo de x) + tornillo central
    z0 = BASE_TOP - BASE_ESP
    s = subtract(s, cylinder((0, EJE_Y, z0), HUB / 2, 2 * HUB_PROF, axis='z'))
    s = subtract(s, box((HORN_L / 2, EJE_Y, z0), (HORN_L, HORN_W, 2 * HORN_PROF), 0))   # (v1.2) bracito de 1 punta hacia +x
    s = subtract(s, cylinder((0, EJE_Y, BASE_TOP), 1.3, BASE_ESP * 3, axis='z'))
    # paso de cables de la cabeza hacia el cuerpo
    # (v1.2) del lado libre (−x), pegado al centro de giro, con bordes redondeados
    s = subtract(s, box((-10.5, EJE_Y, BASE_TOP - BASE_ESP / 2), (8, 6.5, BASE_ESP + 6), 2.0))
    return s


BOUNDS_CABEZA = ((-EXT_X - 1, -1, -EXT_Z - 1), (EXT_X + 1, FONDO + 1, EXT_Z + 1))
BOUNDS_TAPA = ((-EXT_X - 1, EJE_Y - 5, -EXT_Z - 1), (EXT_X + 1, FONDO + TAPA + 1, EXT_Z + 1))
BOUNDS_U = ((-BRAZO_OUT - 1, EJE_Y - BRAZO_Y, BASE_TOP - BASE_ESP - 1), (BRAZO_OUT + 1, EJE_Y + BRAZO_Y, EJE_Z + 8))

if __name__ == '__main__':
    print(f'cabeza {2*EXT_X:.1f} x {FONDO+TAPA:.1f} x {2*EXT_Z:.1f} mm · eje SÍ en y={EJE_Y:.2f} z={EJE_Z:.2f}')
    print(f'servo: base x={BASE_SERVO_X:.1f} orejas x={OREJA_X:.1f} torre x={TORRE_X:.1f}')
    print(f'U: brazos x=±{BRAZO_IN:.1f}..{BRAZO_OUT:.1f}, base z={BASE_TOP-BASE_ESP:.1f}..{BASE_TOP}')
