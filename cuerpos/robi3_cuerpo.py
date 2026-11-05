"""
Robi v3: CUERPO "poroto" (carcasa + tapa de abajo) y BRAZOS curvos. Va con la cabeza de robi3.py.

Mismos ejes y origen que robi3.py: x a la derecha (mirando a Robi de frente), y hacia atrás (la cara mira a -y),
z arriba; origen en el centro de la cara de la cabeza. El eje del NO está en x=0, y=EJE_Y (22,35).

Forma: caja muy redondeada y alta que se angosta un poco hacia arriba (como robi2_conceptos.py "poroto"),
base plana. Arriba es plana donde va el collar (z = -31,3, medio mm debajo del collar).

Qué va adentro (medidas en pruebas/MEDIDAS.md):
  - Servo del NO parado arriba al centro, a lo largo de +x, atornillado desde abajo a 2 pilares del techo.
    El bracito del NO (recortado a 11 mm) queda dentro del collar.
  - Servos de los brazos parados adelante a los costados (delante del servo del NO), eje por las paredes.
  - Pila 18650 parada atrás a la izquierda (apoya en 2 costillitas de la tapa de abajo).
  - Parlante parado contra el frente, 3 mm arriba del piso: suena por la "boquita" de abajo.
  - X7 contra la espalda, abajo: display por la ventanita, USB-C por la pared derecha, S1 por la tapa de abajo.
  - Placa perforada (30 × 38) parada en el medio: riel en la pared derecha + poste con ranura en la tapa.
  - Interruptor en la pared derecha atrás. Mic en el techo adelante (debajo de la cabeza).
  - Touch en la panza y en la espalda (pared de 1 mm). MPU6050 y ampli pegados en la tapa de abajo.
  - Cables de la cabeza: bajan por el agujero de atrás del collar y entran por una ranura en medialuna del techo
    (detrás del servo del NO), que acompaña el giro del NO hasta ±40° sin pellizcarlos.
Se imprime boca abajo (el techo contra la cama), con soportes en árbol "solo en la cama" para la cúpula.
"""
import numpy as np

import robi3 as R
from medidas import HOLGURA as H
from robi3 import bloque, rrect
from sdf import cylinder, halfspace, intersect, smooth_union, subtract, union

# ---------------------------------------------------------------- forma
HX, HY = 33.0, 27.0                  # medio ancho y media profundidad abajo (66 × 54)
CY = 18.0                            # centro en y (sobresale 9 mm adelante de la cara)
AFINA = 0.10                         # arriba queda 10 % más angosto (59,4 mm)
Z_TOP = R.COLLAR_Z0 - 0.5            # -31,3
ALTO = 94.0
Z_BOT = Z_TOP - ALTO                 # -125,3
TAPA = 2.0
Z_PISO = Z_BOT + TAPA                # -123,3
PARED = 2.0
ZI_TOP = Z_TOP - PARED               # techo por dentro
R_FRENTE, R_ATRAS = 14.0, 6.0        # esquinas vistas desde arriba
R_ARRIBA, R_ABAJO = 16.0, 2.5        # redondeo de arriba (cúpula) y de la base


def _k(z):
    t = np.clip((z - Z_BOT) / ALTO, 0, 1)
    return 1.0 - AFINA * t ** 2


def medidas_a(z, inset=0.0):
    """(x0, x1, y0, y1) del contorno a la altura z (sin contar el redondeo de arriba/abajo)."""
    k = _k(z)
    ax, ay = HX * k - inset, HY * (0.5 + 0.5 * k) - inset
    return -ax, ax, CY - ay, CY + ay


def poroto(inset=0.0, z=(Z_BOT, Z_TOP), r_arr=R_ARRIBA, r_ab=R_ABAJO):
    """Contorno del cuerpo achicado `inset` mm (SDF casi exacta: la pared queda pareja)."""
    z0, z1 = z
    zc, hz = (z0 + z1) / 2, (z1 - z0) / 2
    rf, rb = max(R_FRENTE - inset, 0.5), max(R_ATRAS - inset, 0.5)
    ra, rab = max(r_arr - inset, 0.5), max(r_ab - inset, 0.3)

    def f(p):
        X, Y, Z = p[..., 0], p[..., 1], p[..., 2]
        x0, x1, y0, y1 = medidas_a(Z, inset)
        d2 = rrect(X, Y, x0, x1, y0, y1, rf, rb, rf, rb)
        r = np.where(Z > zc, ra, rab)
        u = d2 + r
        v = np.abs(Z - zc) - hz + r
        return np.minimum(np.maximum(u, v), 0) + np.sqrt(np.maximum(u, 0) ** 2 + np.maximum(v, 0) ** 2) - r
    return f


def exterior():
    return poroto(0)


def interior():
    # abierto abajo (ahí va la tapa); arriba, cúpula concéntrica con la de afuera
    return poroto(PARED, (Z_PISO - 6, ZI_TOP), r_ab=0.5)


def chaflan(f, punto, n):
    """Corta f con un plano a 45° que pasa por `punto` (normal n): así se imprime sin soportes."""
    n = np.asarray(n, float) / np.linalg.norm(n)
    return intersect(f, halfspace(n, float(np.dot(punto, n))))


def dentro(f):
    """Recorta una pieza interna para que no salga por afuera del cuerpo."""
    return intersect(f, poroto(0.3, (Z_PISO, Z_TOP)))


# ---------------------------------------------------------------- servo SG90
SL, SW, SH = R.SERVO_L, R.SERVO_A, R.SERVO_CUERPO        # 22,9 · 12 · 22,7
TORRE, OREJAS, OREJA_Z = R.SERVO_TORRE, R.SERVO_OREJAS, R.SERVO_OREJAS_ALTO
EJE_PUNTA = R.SERVO_EJE_PUNTA
ORE_EXT = (OREJAS - SL) / 2                              # 4,7
ORE_ESP = 2.5
ORE_AGUJ = 27.8 / 2
R_TORRE = 6.4

# Servo del NO: eje en (0, EJE_Y), cuerpo hacia +x. La torre llega a la altura del techo (z = -31,3).
NO_Y = R.EJE_Y
NO_TAPA_Z = Z_TOP - TORRE                                # -37,1
NO_BASE_Z = NO_TAPA_Z - SH                               # -59,8
NO_OREJA_Z0 = NO_BASE_Z + OREJA_Z                        # -43,9 (cara de abajo de las orejitas)
NO_X0, NO_X1 = -EJE_PUNTA, SL - EJE_PUNTA                # -5,9 .. 17
NO_CX = (NO_X0 + NO_X1) / 2
NO_AGUJ_X = (NO_CX - ORE_AGUJ, NO_CX + ORE_AGUJ)         # -8,35 · 19,45

# Servos de los brazos: eje a lo largo de x, cuerpo parado, delante del servo del NO
BR_Y = 8.5                                               # cuerpo y 2,5 .. 14,5
BR_TOP = -45.2                                           # punta de arriba del cuerpo (orejita hasta -39)
BR_EJE_Z = BR_TOP - EJE_PUNTA                            # -49,6: el hombro
BR_BOT = BR_TOP - SL                                     # -66,6
BR_CZ = (BR_TOP + BR_BOT) / 2
BR_TAPA_X = 27.6                                         # cara de la torre (la pared se inclina: ahí es lo más justo)
BR_BASE_X = BR_TAPA_X - SH                               # 5,1
BR_OREJA_X0 = BR_BASE_X + OREJA_Z                        # 21,0

# Pila 18650 parada (portapila 21 × 19,9 × 76,1), atrás a la izquierda
PILA = (21.0, 19.9, 76.1)
PILA_X = (-28.2, -7.2)
PILA_Y = (16.0, 35.9)
PILA_Z = (Z_PISO + 1.5, Z_PISO + 1.5 + PILA[2])          # -121,8 .. -45,7 (debajo de la orejita del NO)

# Parlante (39,5 de ancho × 53,5 de alto × 4) parado contra el frente
PAR = (39.5, 4.0, 53.5)
PAR_Z0 = Z_PISO + 3.0                                    # 3 mm de aire abajo: por ahí sale el sonido
PAR_Y0 = medidas_a(PAR_Z0 + PAR[2], PARED)[2] + 0.45      # pegado al frente (la pared se inclina apenas)
PAR_Y = (PAR_Y0, PAR_Y0 + PAR[1] + 2 * H)

# Módulo X7: contra la espalda, abajo. Display hacia atrás; USB-C hacia +x (pared derecha); botón S1 abajo
X7_ANCHO, X7_LARGO, X7_ESP = 28.4, 34.5, 12.2
X7_Z0 = Z_PISO + 2.5
X7_Z1 = X7_Z0 + X7_ANCHO
X7_X1 = medidas_a(X7_Z1, PARED)[1] + 0.5                 # punta del USB-C, medio mm adentro de la pared
X7_X0 = X7_X1 - X7_LARGO
X7_CARA = 40.4                                           # cara del display (y)
USB_Y = X7_CARA - 1.6
USB_Z = X7_Z0 + 14.65
VENTANA = dict(x=(X7_X0 + 8.5, X7_X0 + 23.5), z=(X7_Z0 + 15.0, X7_Z0 + 26.0))

# Placa perforada cortada a 30 × 38, parada de frente
PERFO = dict(x=(-2.0, 28.0), y=(12.0, 13.5), z=(-111.0, -73.0))

# Interruptor (pared derecha, atrás) · touch · mic
INT_Y, INT_Z = 26.0, -79.5
INT_A, INT_H = 8.3 + 2 * H, 15.1 + 2 * H
TOUCH_A, TOUCH_H = 10.7, 15.2
PANZA_Z = -57.0                                          # touch de la panza (entre el parlante y el pecho)
ESPALDA = (8.0, -72.0)                                   # touch de la espalda (x, z)
MIC_Y = 6.5                                              # agujerito del mic (adelante del collar, bajo la cabeza)
MIC_R = 14.1 / 2

# Ranura de los cables en el techo: medialuna detrás del servo del NO, centrada atrás (90°)
CABLE_R0, CABLE_R1 = 6.9, 12.2
CABLE_ANG = 58.0                                         # ± grados (agujero del collar ±18° + giro del NO ±40°)

# Tornillos de la tapa de abajo: 4 pilares cortos pegados a las paredes
POSTES = [(-27.0, 0.0), (26.0, -3.0), (-27.5, 11.0), (27.5, 13.0)]
POSTE_R, POSTE_H = 2.6, 10.0

# MPU6050 (20 × 15,6) y amplificador (17,7 × 17,7) en la tapa de abajo: (x0, y0, ancho x, prof y)
MPU = (2.0, 12.4, 20.0, 15.6)
AMP = (-22.6, -2.5, 17.7, 17.7)


# ======================================================== CARCASA (se imprime boca abajo)
def carcasa():
    ext = poroto(0, (Z_PISO, Z_TOP))
    s = subtract(ext, interior())

    # --- servo del NO: torre por el techo + 2 pilares (tornillos desde abajo)
    s = subtract(s, cylinder((0, NO_Y, Z_TOP - 1), R_TORRE, 6))
    s = subtract(s, bloque((0, 7.0), (NO_Y - 4.8, NO_Y + 4.8), (Z_TOP - 4, Z_TOP + 1), 2.0))
    for x in NO_AGUJ_X:
        z0 = NO_OREJA_Z0 + ORE_ESP + H
        p = cylinder((x, NO_Y, (z0 + Z_TOP) / 2), 2.3, Z_TOP - z0)
        s = union(s, dentro(p))
        s = subtract(s, cylinder((x, NO_Y, z0 + 4), 0.9, 8))

    # --- medialuna para los cables (detrás del servo del NO)
    def medialuna(p):
        dx, dy = p[..., 0], p[..., 1] - NO_Y
        r = np.sqrt(dx ** 2 + dy ** 2)
        ang = np.degrees(np.arctan2(dy, dx))
        d_r = np.maximum(CABLE_R0 - r, r - CABLE_R1)
        d_a = (np.abs(ang - 90) - CABLE_ANG) * np.radians(1) * r
        d_z = np.abs(p[..., 2] - Z_TOP) - 4
        return np.maximum(np.maximum(d_r, d_a), d_z)
    s = subtract(s, medialuna)

    # --- servos de los brazos: agujero de la torre en cada pared + pilares de las orejitas
    for sx in (-1, 1):
        s = subtract(s, cylinder((sx * (BR_TAPA_X + 3), BR_Y, BR_EJE_Z), R_TORRE, 8, axis='x'))
        s = subtract(s, bloque(sorted((sx * (BR_TAPA_X - 1), sx * (BR_TAPA_X + 6))), (BR_Y - 4.8, BR_Y + 4.8),
                               (BR_EJE_Z - 7.0, BR_EJE_Z), 2.0))
        for z in (BR_CZ + ORE_AGUJ, BR_CZ - ORE_AGUJ):
            x0 = BR_OREJA_X0 + ORE_ESP + H
            p = cylinder((sx * (x0 + 6), BR_Y, z), 2.3, 12, axis='x')
            s = union(s, dentro(p))
            s = subtract(s, cylinder((sx * (x0 + 3.5), BR_Y, z), 0.9, 7, axis='x'))

    # --- parlante: 2 rieles con pestaña (entra deslizando desde abajo) + 2 tacos donde apoya
    px = PAR[0] / 2 + H
    yi0 = PAR_Y[0] - 0.3
    for sx in (-1, 1):
        xs = (px, px + 2) if sx > 0 else (-px - 2, -px)
        xp = (px - 1.4, px + 2) if sx > 0 else (-px - 2, -px + 1.4)
        riel = union(bloque(xs, (yi0 - 3, PAR_Y[1] + 1.4), (PAR_Z0, PAR_Z0 + 40)),
                     bloque(xp, (PAR_Y[1], PAR_Y[1] + 1.4), (PAR_Z0, PAR_Z0 + 40)))
        riel = chaflan(riel, (0, yi0, PAR_Z0 + 40), (0, 1, 1))
        taco = bloque((sx * (px - 3) - 1.5, sx * (px - 3) + 1.5), (yi0 - 3, PAR_Y[1] - 1.0), (Z_PISO, PAR_Z0))
        s = union(s, dentro(union(riel, taco)))
    # "boquita": ranuras abajo al frente por donde sale el sonido
    for i in range(5):
        x = -12 + i * 6
        s = subtract(s, bloque((x - 1.8, x + 1.8), (CY - HY - 2, yi0 + 0.5), (Z_PISO - 1, PAR_Z0 - 0.3), 0.8))

    # --- pila: guía en L en la esquina de adentro (adelante-derecha de la pila)
    g0, g1 = PILA_Z[0] + 8, -73.0
    guia = union(bloque((PILA_X[1] - 6, PILA_X[1] + 1.6), (PILA_Y[0] - 1.6, PILA_Y[0] - H), (g0, g1)),
                 bloque((PILA_X[1] + H, PILA_X[1] + 1.6), (PILA_Y[0] - 1.6, PILA_Y[0] + 6), (g0, g1)))
    guia = chaflan(guia, (PILA_X[1] + 1.6, 0, g1), (1, 0, 1))
    guia = chaflan(guia, (0, PILA_Y[0] - 1.6, g1), (0, -1, 1))
    # la guía cuelga de un brazo que llega a la pared izquierda (por delante de la pila)
    brazo_g = bloque((-HX, PILA_X[1] + 1.6), (PILA_Y[0] - 1.6, PILA_Y[0] - H), (g1 - 12, g1))
    brazo_g = chaflan(brazo_g, (-HX + PARED + 0.5, 0, g1), (1, 0, 1))
    # costilla vertical hasta el techo: la guía no se puede apoyar en el aire (se imprime boca abajo)
    costilla = bloque((PILA_X[1] - 6, PILA_X[1] + 1.6), (PILA_Y[0] - 1.2, PILA_Y[0] - H), (g1 - 3, ZI_TOP + 1.0))
    s = union(s, dentro(union(guia, brazo_g, costilla)))

    # --- X7: 2 costillas desde la espalda + ventanita + USB-C por la pared derecha
    yb = medidas_a(X7_Z0, PARED)[3]
    for x in ((X7_X0, X7_X0 + 3), (X7_X1 - 6.5, X7_X1 - 3)):
        c = bloque(x, (X7_CARA + H, yb + 1.0), (X7_Z0 + 0.5, X7_Z1 - 0.5))
        s = union(s, dentro(chaflan(c, (0, yb, X7_Z1 - 0.5), (0, -1, 1))))
    s = subtract(s, bloque(VENTANA['x'], (X7_CARA - 1, CY + HY + 2), VENTANA['z'], 2.0))
    s = subtract(s, bloque((X7_X1 - 4, HX + 3), (USB_Y - 3.75, USB_Y + 3.75), (USB_Z - 6.5, USB_Z + 6.5), 2.5))

    # --- placa perforada: riel con ranura en la pared derecha
    py, pz = PERFO['y'], PERFO['z']
    riel = bloque((PERFO['x'][1] - 1.0, HX), (py[0] - 1.5, py[1] + 1.5), (pz[0] - 2, pz[1] + 1))
    riel = subtract(riel, bloque((PERFO['x'][1] - 2, PERFO['x'][1] + 0.3), (py[0] - H, py[1] + H), (pz[0] - 3, pz[1] + 3)))
    riel = chaflan(riel, (PERFO['x'][1] - 1.0, 0, pz[1] + 1), (1, 0, 1))
    s = union(s, dentro(riel))

    # --- interruptor (pared derecha, atrás)
    s = subtract(s, bloque((25, HX + 3), (INT_Y - INT_A / 2, INT_Y + INT_A / 2), (INT_Z - INT_H / 2, INT_Z + INT_H / 2), 0.5))

    # --- touch: pared adelgazada a 1 mm detrás de cada uno
    yf = medidas_a(PANZA_Z, PARED)[2]
    s = subtract(s, bloque((-TOUCH_A / 2 - H - 0.3, TOUCH_A / 2 + H + 0.3), (yf - 1.0, yf + 0.5),
                           (PANZA_Z - TOUCH_H / 2 - 0.5, PANZA_Z + TOUCH_H / 2 + 0.5)))
    ex, ez = ESPALDA
    ybk = medidas_a(ez, PARED)[3]
    s = subtract(s, bloque((ex - TOUCH_A / 2 - 0.5, ex + TOUCH_A / 2 + 0.5), (ybk - 0.5, ybk + 1.0),
                           (ez - TOUCH_H / 2 - 0.5, ez + TOUCH_H / 2 + 0.5)))

    # --- micrófono: base plana colgada del techo (el techo ahí ya se curva) + aro que lo centra + agujerito
    zm = MIC_Z
    base = dentro(cylinder((0, MIC_Y, (zm + Z_TOP) / 2), MIC_R + H + 1.2, Z_TOP - zm))
    s = union(s, base)
    s = subtract(s, cylinder((0, MIC_Y, zm - 1.0), MIC_R + H, 2.0 + 0.01))            # asiento del mic
    s = union(s, subtract(cylinder((0, MIC_Y, zm - 0.75), MIC_R + H + 1.2, 1.5),
                          cylinder((0, MIC_Y, zm - 0.75), MIC_R + H, 3)))
    s = subtract(s, cylinder((0, MIC_Y, Z_TOP), 0.9, 2 * (Z_TOP - zm) + 2))
    for a in range(6):                                     # adorno: 6 puntitos alrededor (no pasan)
        t = np.radians(a * 60 + 30)
        s = subtract(s, cylinder((3.2 * np.cos(t), MIC_Y + 3.2 * np.sin(t), Z_TOP), 0.7, 1.2))

    # --- pilares de los tornillos de la tapa de abajo
    for x, y in POSTES:
        sx = np.sign(x)
        p = union(cylinder((x, y, Z_PISO + POSTE_H / 2), POSTE_R, POSTE_H),
                  bloque(sorted((x - sx * POSTE_R, sx * (HX + 1))), (y - POSTE_R, y + POSTE_R), (Z_PISO, Z_PISO + POSTE_H)))
        p = chaflan(p, (x - sx * POSTE_R, 0, Z_PISO + POSTE_H), (sx, 0, 1))
        s = union(s, dentro(p))
        s = subtract(s, cylinder((x, y, Z_PISO + 4), 0.85, 9))
    return s


def _techo_bajo(x, y):
    """z más baja del techo por dentro sobre un disco (para apoyar el mic plano)."""
    a = np.linspace(0, 2 * np.pi, 48)
    zs = []
    for rr in (0, 0.5, 1.0):
        px = x + rr * (MIC_R + H + 1.2) * np.cos(a)
        py = y + rr * (MIC_R + H + 1.2) * np.sin(a)
        for xx, yy in zip(px, py):
            zz = np.linspace(ZI_TOP - 15, ZI_TOP + 0.5, 300)
            p = np.stack([np.full_like(zz, xx), np.full_like(zz, yy), zz], -1)
            d = interior()(p)
            zs.append(zz[d < 0].max())
    return min(zs)


MIC_Z = round(_techo_bajo(0, MIC_Y) - 0.3, 2)              # cara de abajo de la base del mic


# ======================================================== TAPA DE ABAJO (se imprime plana)
def tapa():
    s = intersect(poroto(0, (Z_BOT, Z_TOP)), bloque((-50, 50), (-50, 60), (Z_BOT, Z_PISO)))
    for x, y in POSTES:
        s = subtract(s, cylinder((x, y, Z_PISO), 1.15, 6))
        s = subtract(s, cylinder((x, y, Z_BOT), 2.2, 2.4))
    # costillitas donde apoya la pila (dejan pasar el cable de abajo)
    for y in (PILA_Y[0] + 3, PILA_Y[1] - 3):
        s = union(s, bloque((PILA_X[0] + 1, PILA_X[1] - 1), (y - 1, y + 1), (Z_PISO - 0.1, PILA_Z[0])))
    # bordecitos que ubican el MPU6050 y el amplificador (recortados por la pared)
    lim = poroto(PARED + H, (Z_BOT, Z_TOP + 5))
    for (x0, y0, ax, ay) in (MPU, AMP):
        marco = subtract(bloque((x0 - 1.2 - H, x0 + ax + 1.2 + H), (y0 - 1.2 - H, y0 + ay + 1.2 + H), (Z_PISO - 0.1, Z_PISO + 1.2)),
                         bloque((x0 - H, x0 + ax + H), (y0 - H, y0 + ay + H), (Z_PISO - 1, Z_PISO + 2)))
        s = union(s, intersect(marco, lim))
    # poste con ranura que sostiene el borde izquierdo de la perfo
    py = PERFO['y']
    x0 = PERFO['x'][0]
    poste = bloque((x0 - 2.5, x0 + 1.0), (py[0] - 1.5, py[1] + 1.5), (Z_PISO - 0.1, PERFO['z'][0] + 10))
    poste = subtract(poste, bloque((x0 - 0.3, x0 + 2), (py[0] - H, py[1] + H), (PERFO['z'][0] - H, 0)))
    s = union(s, poste)
    # ranura para apretar el botón S1 del X7 con un escarbadientes
    s = subtract(s, bloque((X7_X1 - 16.5, X7_X1 - 2.5), (X7_CARA - 3.6, X7_CARA + 0.4), (Z_BOT - 1, Z_PISO + 1), 1.0))
    return s


# ======================================================== BRAZO curvo (se imprime acostado, la cara de afuera en la cama)
BRAZO_LARGO = 52.0           # del hombro a la punta de la mano (paleta tipo Eilik)
BRAZO_X0 = BR_TAPA_X + TORRE + 0.4       # cara de adentro (apoya sobre la torre del servo): 34,0
BRAZO_ESP = 8.0              # espesor máximo de la cúpula en el hombro (se afina a 5 en la mano)
BRAZO_AVANCE = 11.0          # cuánto se va la mano hacia adelante (curva de media luna)


def _semi(t):
    """Medio ancho (en y-z) de la paleta a lo largo del brazo, t = 0 hombro .. 1 punta."""
    return 6.6 + 4.0 * np.sin(np.pi * np.clip(t, 0, 1) ** 0.75)


def _curva(t):
    return BR_Y - BRAZO_AVANCE * t ** 2.5, BR_EJE_Z - (BRAZO_LARGO - 6.0) * t


def brazo(sx=1):
    n = 12
    pts = [_curva(i / n) for i in range(n + 1)]

    def perfil(p):          # silueta de costado (y-z): tubo que se afina + hombro redondo + manito
        Y, Z = p[..., 1], p[..., 2]
        d = np.sqrt((Y - BR_Y) ** 2 + (Z - BR_EJE_Z) ** 2) - 7.0
        for i in range(n):
            (ya, za), (yb, zb) = pts[i], pts[i + 1]
            ra, rb = _semi(i / n), _semi((i + 1) / n)
            by, bz = yb - ya, zb - za
            h = np.clip(((Y - ya) * by + (Z - za) * bz) / (by * by + bz * bz), 0, 1)
            seg = np.sqrt((Y - ya - by * h) ** 2 + (Z - za - bz * h) ** 2) - (ra + (rb - ra) * h)
            k = 3.0
            hh = np.clip(0.5 + 0.5 * (seg - d) / k, 0, 1)
            d = seg + (d - seg) * hh - k * hh * (1 - hh)
        ym, zm = pts[-1]
        mano = np.sqrt((Y - ym + 0.5) ** 2 + (Z - zm + 0.5) ** 2) - 6.4
        hh = np.clip(0.5 + 0.5 * (mano - d) / 2.0, 0, 1)
        return mano + (d - mano) * hh - 2.0 * hh * (1 - hh)

    xo = BRAZO_X0 + BRAZO_ESP                 # tope de la cúpula en el hombro (para el tornillo)
    re = 0.9                                  # cantos redondeados
    R_CUPULA = 7.5                            # a esta distancia del borde la cúpula llega a su espesor máximo
    H_BORDE = 1.2                             # espesor en el borde de la paleta

    def f(p):
        X, Z = sx * p[..., 0], p[..., 2]
        u0 = perfil(p)
        # espesor máximo: BRAZO_ESP en el hombro, se afina 3 mm hacia la punta
        T = BRAZO_ESP - 3.0 * np.clip((BR_EJE_Z - Z) / BRAZO_LARGO, 0, 1)
        sdist = np.clip(-u0 / R_CUPULA, 0, 1)
        h = H_BORDE + (T - H_BORDE) * np.sqrt(1 - (1 - sdist) ** 2)     # perfil de media elipse
        xi = BRAZO_X0                                                    # cara de adentro: PLANA
        u = u0 + re
        v = np.maximum(xi - X, X - (xi + h)) + re
        return np.minimum(np.maximum(u, v), 0) + np.sqrt(np.maximum(u, 0) ** 2 + np.maximum(v, 0) ** 2) - re

    s = f
    # muesca escalonada del bracito de 1 punta: centro hondo + rampita + canaleta del brazo (hacia abajo)
    x0 = sx * BRAZO_X0
    hx = x0 + sx * (R.HUB_PROF / 2 - 0.01)
    cx = x0 + sx * (R.HORN_PROF / 2 - 0.01)
    s = subtract(s, cylinder((hx, BR_Y, BR_EJE_Z), R.HUB / 2, R.HUB_PROF, axis='x'),
                 bloque(sorted((hx - R.HUB_PROF / 2, hx + R.HUB_PROF / 2)), (BR_Y - R.HUB / 2, BR_Y + R.HUB / 2),
                        (BR_EJE_Z - R.RAMPA, BR_EJE_Z)),
                 bloque(sorted((cx - R.HORN_PROF / 2, cx + R.HORN_PROF / 2)), (BR_Y - R.HORN_W / 2, BR_Y + R.HORN_W / 2),
                        (BR_EJE_Z - R.HORN_L, BR_EJE_Z)))
    # tornillo central con rebaje para la cabeza (del lado de afuera)
    s = subtract(s, cylinder((sx * (xo - BRAZO_ESP / 2), BR_Y, BR_EJE_Z), 1.3, BRAZO_ESP + 2, axis='x'))
    s = subtract(s, cylinder((sx * xo, BR_Y, BR_EJE_Z), 2.4, 3.0, axis='x'))
    return s


B_CARCASA = ((-HX - 1, CY - HY - 1, Z_PISO - 1), (HX + 1, CY + HY + 1, Z_TOP + 1))
B_TAPA = ((-HX - 1, CY - HY - 1, Z_BOT - 1), (HX + 1, CY + HY + 1, PERFO['z'][0] + 11))
B_BRAZO = ((BRAZO_X0 - 1, BR_Y - BRAZO_AVANCE - 12, BR_EJE_Z - BRAZO_LARGO - 2), (BRAZO_X0 + BRAZO_ESP + 1, BR_Y + 14, BR_EJE_Z + 10))


def b_brazo(sx):
    (x0, y0, z0), (x1, y1, z1) = B_BRAZO
    return ((x0, y0, z0), (x1, y1, z1)) if sx > 0 else ((-x1, y0, z0), (-x0, y1, z1))


# ======================================================== chequeo: cada pieza de adentro entra sin tocar las paredes
PIEZAS = {
    'servo NO (cuerpo)': ((NO_X0 - H, NO_X1 + H), (NO_Y - SW / 2 - H, NO_Y + SW / 2 + H), (NO_BASE_Z, NO_TAPA_Z)),
    'servo NO (orejitas)': ((NO_CX - OREJAS / 2, NO_CX + OREJAS / 2), (NO_Y - SW / 2, NO_Y + SW / 2), (NO_OREJA_Z0, NO_OREJA_Z0 + ORE_ESP)),
    'servo brazo der': ((BR_BASE_X, BR_TAPA_X), (BR_Y - SW / 2 - H, BR_Y + SW / 2 + H), (BR_BOT - H, BR_TOP + H)),
    'orejitas brazo der': ((BR_OREJA_X0, BR_OREJA_X0 + ORE_ESP), (BR_Y - SW / 2, BR_Y + SW / 2), (BR_CZ - OREJAS / 2, BR_CZ + OREJAS / 2)),
    'servo brazo izq': ((-BR_TAPA_X, -BR_BASE_X), (BR_Y - SW / 2 - H, BR_Y + SW / 2 + H), (BR_BOT - H, BR_TOP + H)),
    'orejitas brazo izq': ((-BR_OREJA_X0 - ORE_ESP, -BR_OREJA_X0), (BR_Y - SW / 2, BR_Y + SW / 2), (BR_CZ - OREJAS / 2, BR_CZ + OREJAS / 2)),
    'pila': (PILA_X, PILA_Y, PILA_Z),
    'parlante': ((-PAR[0] / 2 - H, PAR[0] / 2 + H), PAR_Y, (PAR_Z0, PAR_Z0 + PAR[2])),
    'X7': ((X7_X0, X7_X1 - 1.0), (X7_CARA - X7_ESP, X7_CARA), (X7_Z0, X7_Z1)),
    'perfo + componentes': (PERFO['x'], (PERFO['y'][0] - 10, PERFO['y'][1] + 2.5), PERFO['z']),
    'interruptor': ((HX - PARED - 15.0, HX - PARED - 0.5), (INT_Y - 4.15, INT_Y + 4.15), (INT_Z - 7.55, INT_Z + 7.55)),
    'touch panza': ((-TOUCH_A / 2, TOUCH_A / 2), (medidas_a(PANZA_Z, PARED)[2] - 0.9, medidas_a(PANZA_Z, PARED)[2] + 1.3),
                    (PANZA_Z - TOUCH_H / 2, PANZA_Z + TOUCH_H / 2)),
    'touch espalda': ((ESPALDA[0] - TOUCH_A / 2, ESPALDA[0] + TOUCH_A / 2),
                      (medidas_a(ESPALDA[1], PARED)[3] - 1.3, medidas_a(ESPALDA[1], PARED)[3] + 0.9),
                      (ESPALDA[1] - TOUCH_H / 2, ESPALDA[1] + TOUCH_H / 2)),
    'MPU6050': ((MPU[0], MPU[0] + MPU[2]), (MPU[1], MPU[1] + MPU[3]), (Z_PISO, Z_PISO + 2.7)),
    'amplificador': ((AMP[0], AMP[0] + AMP[2]), (AMP[1], AMP[1] + AMP[3]), (Z_PISO, Z_PISO + 2.1)),
    'mic': ((-MIC_R, MIC_R), (MIC_Y - MIC_R, MIC_Y + MIC_R), (MIC_Z - 1.9, MIC_Z)),
}
# piezas que pueden tocar la pared a propósito (salen por un agujero o están contra una pared adelgazada)
TOCAN = {'X7', 'touch panza', 'touch espalda', 'interruptor'}


def _puntos(b, n=7):
    g = [np.linspace(a0, a1, n) for a0, a1 in b]
    return np.stack(np.meshgrid(*g, indexing='ij'), -1).reshape(-1, 3)


def verificar():
    """Huelgo mínimo de cada pieza con la pared (interior) y entre piezas. Devuelve una lista de problemas."""
    inte = interior()
    malos = []
    for nombre, b in PIEZAS.items():
        p = _puntos(b)
        p = p[p[:, 2] > Z_PISO + 0.01]
        d = -inte(p).max()
        if nombre not in TOCAN and d < 0.1:
            malos.append(f'{nombre}: se sale {-d:.2f} mm')
        print(f'  {nombre:22s} huelgo con la pared {d:6.2f} mm')
    nombres = list(PIEZAS)
    for i, a in enumerate(nombres):
        for b_ in nombres[i + 1:]:
            A, B = PIEZAS[a], PIEZAS[b_]
            sep = max(max(B[k][0] - A[k][1], A[k][0] - B[k][1]) for k in range(3))
            if sep < 0.1 and not ({a, b_} <= {'servo NO (cuerpo)', 'servo NO (orejitas)'}
                                  or (a.endswith('der') and b_.endswith('der'))
                                  or (a.endswith('izq') and b_.endswith('izq'))):
                malos.append(f'{a} ↔ {b_}: se pisan ({sep:.2f} mm)')
    return malos


if __name__ == '__main__':
    print(f'cuerpo {2*HX:.1f} × {2*HY:.1f} × {ALTO:.1f} mm (arriba {2*HX*_k(Z_TOP):.1f} de ancho) · z {Z_BOT:.1f} .. {Z_TOP:.1f}')
    print(f'Robi entero: {R.EXT_Z1 - Z_BOT:.1f} mm de alto · con brazos {2*(BRAZO_X0+BRAZO_ESP):.1f} mm de ancho')
    print(f'servo NO: tapa z={NO_TAPA_Z:.1f} base z={NO_BASE_Z:.1f} orejas z={NO_OREJA_Z0:.1f} · pilares x={NO_AGUJ_X}')
    print(f'brazos: eje z={BR_EJE_Z:.1f} (servo z {BR_BOT:.1f}..{BR_TOP:.1f}), base x=±{BR_BASE_X:.1f}')
    print(f'parlante y {PAR_Y[0]:.2f}..{PAR_Y[1]:.2f} · X7 x {X7_X0:.1f}..{X7_X1:.1f} · mic z {MIC_Z}')
    m = verificar()
    print('OK: todo entra' if not m else '\n'.join(['PROBLEMAS:'] + m))
