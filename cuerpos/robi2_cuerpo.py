"""
Robi v2: CUERPO (carcasa + tapa de abajo) y BRAZOS.

Mismos ejes y origen que robi2.py: x a la derecha (mirando a Robi de frente), y hacia atrás (la cara mira
a -y), z arriba; origen en el centro de la cara de la cabeza. El eje del NO está en x=0, y=EJE_Y.

Qué va adentro (todo medido con calibre, ver pruebas/MEDIDAS.md):
  - Servo del NO parado arriba al centro, a lo largo de x (cuerpo hacia +x), atornillado desde abajo a 2 pilares.
  - Servos de los brazos a los costados, adelante, con el eje saliendo por las paredes laterales.
  - Pila 18650 parada atrás a la izquierda.
  - Parlante parado contra la pared del frente; suena por el canto de abajo -> "boquita" abajo al frente.
  - Módulo X7 contra la espalda (display en la ventanita), USB-C por la pared derecha, botón S1 por abajo.
  - Placa perforada parada en el medio (riel en la pared derecha + pilar a la izquierda).
  - Interruptor en la pared derecha, atrás. Mic arriba al frente (agujerito en el techo).
  - Touch: panza (frente) y espalda, con la pared adelgazada a 1 mm detrás de cada uno.
  - MPU6050 y amplificador pegados en la tapa de abajo.
Se imprime boca abajo (el techo contra la cama). La tapa de abajo va con 4 tornillitos M2.
"""
import numpy as np

import robi2 as R
from medidas import HOLGURA as H
from sdf import box, capsule, cylinder, halfspace, intersect, subtract, union

# ---------------------------------------------------------------- carcasa
PARED = 2.0
X_EXT = 32.0                         # cuerpo de 64 mm de ancho
Y0, Y1 = -7.0, 39.0                  # 46 mm de profundidad
Z_TOP = R.BASE_TOP - R.BASE_ESP - 1.5   # 1,5 mm debajo de la base de la U (que gira encima)
ALTO = 92.0
Z_BOT = Z_TOP - ALTO
TAPA = 2.0
Z_PISO = Z_BOT + TAPA                # cara de arriba de la tapa de abajo
R_VERT = 3.5                         # redondeo de las aristas verticales (chico: la pila va en una esquina)
R_ARR = 8.0                          # redondeo de las aristas de arriba
XI = X_EXT - PARED                   # interior: x ±30
YI0, YI1 = Y0 + PARED, Y1 - PARED    # interior: y -5 .. 37
ZI_TOP = Z_TOP - PARED               # techo por dentro

# ---------------------------------------------------------------- servo SG90 (medidas de robi2)
SL, SW, SH = R.SERVO_L, R.SERVO_A, R.SERVO_CUERPO        # 22,9 · 12 · 22,7
TORRE, OREJAS, OREJA_Z = R.SERVO_TORRE, R.SERVO_OREJAS, R.SERVO_OREJAS_ALTO
EJE_PUNTA = R.SERVO_EJE_PUNTA                           # 5,9
ORE_EXT = (OREJAS - SL) / 2                             # 4,7 lo que salen las orejitas
ORE_ESP = 2.5
ORE_AGUJ = 27.8 / 2                                     # agujeros de las orejitas, desde el centro
R_TORRE = 6.4                                           # agujero para la torre del engranaje

# Servo del NO: eje en (0, EJE_Y), cuerpo a lo largo de +x. La cara plana del bracito queda al ras de la U.
NO_Y = R.EJE_Y
NO_TAPA_Z = R.BASE_TOP - R.BASE_ESP - 0.5 - TORRE       # tapa del cuerpo del servo
NO_BASE_Z = NO_TAPA_Z - SH
NO_OREJA_Z0 = NO_BASE_Z + OREJA_Z                       # cara de abajo de las orejitas
NO_X0, NO_X1 = -EJE_PUNTA, SL - EJE_PUNTA               # -5,9 .. 17
NO_CX = (NO_X0 + NO_X1) / 2
NO_AGUJ_X = (NO_CX - ORE_AGUJ, NO_CX + ORE_AGUJ)

# Servos de los brazos: eje a lo largo de x, cuerpo parado (largo en z), adelante (y -5 .. 7)
BR_Y = YI0 + SW / 2 + 3.0                               # y = 4 (3 mm atrás del frente: esquivan los redondeos)
BR_ORE_TOP = ZI_TOP - 2.5                               # punta de la orejita de arriba
BR_TOP = BR_ORE_TOP - ORE_EXT                           # punta de arriba del cuerpo
BR_EJE_Z = BR_TOP - EJE_PUNTA                           # eje del hombro
BR_BOT = BR_TOP - SL
BR_CZ = (BR_TOP + BR_BOT) / 2
BR_BASE_X = XI - SH                                     # base del servo (la tapa toca la pared)
BR_OREJA_X0 = BR_BASE_X + OREJA_Z                       # cara de la orejita (hacia adentro)

# Pila 18650 parada, atrás a la izquierda
PILA = (21.0, 19.9, 76.1)
PILA_X = (-XI + 0.7, -XI + 0.7 + PILA[0])               # -29,3 .. -8,3
PILA_Y = (YI1 - 0.7 - PILA[1], YI1 - 0.7)               # 16,4 .. 36,3
PILA_Z = (Z_PISO + 1.5, Z_PISO + 1.5 + PILA[2])         # sobre 2 costillitas de la tapa (pasa el cable)

# Parlante parado contra el frente (39,5 de ancho × 53,5 de alto × 4)
PAR = (39.5, 4.0, 53.5)
PAR_Z0 = Z_PISO + 3.0                                   # 3 mm de aire abajo: por ahí sale el sonido
PAR_Y = (YI0, YI0 + PAR[1] + 2 * H)

# Módulo X7: contra la espalda, display hacia atrás; USB-C hacia +x (pared derecha), botón S1 hacia abajo
X7_ANCHO, X7_LARGO, X7_ESP = 28.4, 34.5, 12.2           # ancho (z) · largo con USB-C (x) · espesor (y)
X7_X1 = XI + 0.5                                        # punta del USB-C, medio mm adentro de la pared
X7_X0 = X7_X1 - X7_LARGO
X7_Z0 = Z_PISO + 2.5
X7_Z1 = X7_Z0 + X7_ANCHO
X7_CARA = 31.6                                          # cara del display (y)
USB_Y = X7_CARA - 1.6
USB_Z = X7_Z0 + 14.65                                   # centro del USB-C (medido: termina a 19,1 del borde del S1)

# Placa perforada (cortada a 30 × 40) parada, de frente
PERFO = dict(x=(-6.0, 24.0), y=(12.0, 13.5), z=(-112.0, -72.0))

# Interruptor (pared derecha, atrás) y touch
INT_Y, INT_Z = 26.0, -79.5
INT_A, INT_H = 8.3 + 2 * H, 15.1 + 2 * H
TOUCH_A, TOUCH_H = 10.7, 15.2
PANZA_Z = (BR_EJE_Z - 4.0)                              # centro del touch de la panza
ESPALDA = (11.35, -74.4)                                # centro (x, z) del touch de la espalda
MIC_Y = 5.5                                             # centro del mic (Ø 14,1) pegado bajo el techo
VENTANA = dict(x=(4.5, 19.5), z=(-107.0, -96.0))        # ventanita del display del X7

# Tornillos de la tapa de abajo: 4 pilares cortos pegados a las paredes
POSTES = [(-27.0, -2.0), (27.0, -2.0), (-27.5, 11.0), (27.5, 13.0)]
POSTE_R, POSTE_H = 2.6, 10.0


def bloque(x, y, z, r=0.0):
    """Caja dada por rangos (x0,x1), (y0,y1), (z0,z1)."""
    return box(((x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2),
               (x[1] - x[0], y[1] - y[0], z[1] - z[0]), r)


def chaflan(f, punto, n):
    """Corta f con un plano a 45° que pasa por `punto` (normal n): así las salientes se imprimen sin soportes."""
    n = np.asarray(n, float) / np.linalg.norm(n)
    return intersect(f, halfspace(n, float(np.dot(punto, n))))


def silueta(inset=0.0, z=(Z_BOT, Z_TOP), r_arr=R_ARR):
    """Contorno exterior del cuerpo (redondeado), achicado `inset` mm."""
    x0, x1 = -X_EXT + inset, X_EXT - inset
    y0, y1 = Y0 + inset, Y1 - inset
    rv = max(R_VERT - inset, 0.5)
    alto = z[1] - z[0]
    # aristas verticales redondeadas (prisma) ∩ perfiles redondeados arriba (de frente y de costado)
    cy, cz = (y0 + y1) / 2, (z[0] + z[1]) / 2
    ra = max(r_arr - inset, 0.5)
    prisma = intersect(box((0, cy, cz), (x1 - x0, y1 - y0, alto + 2 * rv + 4), rv),
                       box((0, cy, cz), (x1 - x0 + 4, y1 - y0 + 4, alto)))
    frente = box((0, cy, z[1] - 30), (x1 - x0, y1 - y0 + 2 * ra + 4, 60), ra)      # redondea aristas x-z
    costado = box((0, cy, z[1] - 30), (x1 - x0 + 2 * ra + 4, y1 - y0, 60), ra)     # redondea aristas y-z
    abajo = box((0, cy, (z[0] + z[1] - 30) / 2), (x1 - x0 + 4, y1 - y0 + 4, alto - 30 + 0.01))
    return intersect(prisma, union(intersect(frente, costado), abajo))


# ======================================================== CARCASA (se imprime boca abajo)
def carcasa():
    s = subtract(silueta(0, (Z_PISO, Z_TOP)), silueta(PARED, (Z_PISO - 1, Z_TOP - PARED)))

    # --- servo del NO: agujero para la torre + 2 pilares para las orejitas (tornillos desde abajo)
    s = subtract(s, cylinder((0, NO_Y, Z_TOP - 1), R_TORRE, 6))
    s = subtract(s, box((3.5, NO_Y, Z_TOP - 1), (7, 2 * R_TORRE * 0.75, 6), 2.0))     # bultito de la torre
    for x in NO_AGUJ_X:
        p = cylinder((x, NO_Y, (NO_OREJA_Z0 + ORE_ESP + ZI_TOP) / 2 + 0.5), 2.6,
                     ZI_TOP - (NO_OREJA_Z0 + ORE_ESP) + 1)
        s = union(s, p)
        s = subtract(s, cylinder((x, NO_Y, NO_OREJA_Z0 + ORE_ESP + 4), 0.9, 8))
    # --- paso de cables de la cabeza (deja pasar también el conector de 2×8)
    s = subtract(s, box((-15.25, (11.5 + 33.2) / 2, Z_TOP - 1), (7.5, 33.2 - 11.5, 6), 2.0))

    # --- servos de los brazos: agujero de la torre en cada pared + pilares de las orejitas
    for sx in (-1, 1):
        s = subtract(s, cylinder((sx * X_EXT, BR_Y, BR_EJE_Z), R_TORRE, PARED * 2 + 2, axis='x'))
        s = subtract(s, box((sx * X_EXT, BR_Y, BR_EJE_Z - 3.5), (PARED * 2 + 2, 2 * R_TORRE * 0.75, 7), 2.0))
        for z in (BR_CZ + ORE_AGUJ, BR_CZ - ORE_AGUJ):
            largo = XI - (BR_OREJA_X0 + ORE_ESP)
            p = cylinder((sx * (XI - largo / 2 + 0.5), BR_Y, z), 2.6, largo + 1, axis='x')
            s = union(s, p)
            s = subtract(s, cylinder((sx * (BR_OREJA_X0 + ORE_ESP + 3.5), BR_Y, z), 0.9, 7, axis='x'))

    # --- parlante: 2 rieles con pestaña (entra deslizando desde abajo) + 2 tacos donde apoya
    px = PAR[0] / 2 + H
    for sx in (-1, 1):
        riel = bloque((px, px + 2) if sx > 0 else (-px - 2, -px), (YI0, PAR_Y[1] + 1.4), (Z_PISO, PAR_Z0 + 40))
        pest = bloque((px - 1.4, px + 2) if sx > 0 else (-px - 2, -px + 1.4), (PAR_Y[1], PAR_Y[1] + 1.4),
                      (Z_PISO, PAR_Z0 + 40))
        taco = bloque((sx * (px - 3) - 1.5, sx * (px - 3) + 1.5), (YI0, PAR_Y[1]), (Z_PISO, PAR_Z0))
        s = union(s, chaflan(union(riel, pest), (0, YI0, PAR_Z0 + 40), (0, 1, 1)), taco)
    # "boquita": ranuras abajo al frente por donde sale el sonido
    for i in range(5):
        x = -12 + i * 6
        s = subtract(s, bloque((x - 1.8, x + 1.8), (Y0 - 1, YI0 + 0.5), (Z_PISO - 1, PAR_Z0 - 0.3), 0.8))

    # --- pila: guía en L en la esquina de adentro
    guia = union(bloque((PILA_X[1] - 6, PILA_X[1] + 1.6), (PILA_Y[0] - 1.6, PILA_Y[0]), (PILA_Z[0] + 8, PILA_Z[0] + 60)),
                 bloque((PILA_X[1], PILA_X[1] + 1.6), (PILA_Y[0] - 1.6, PILA_Y[0] + 6), (PILA_Z[0] + 8, PILA_Z[0] + 60)))
    guia = chaflan(guia, (PERFO['x'][0] - 2.5, 0, PILA_Z[0] + 60), (-1, 0, 1))
    guia = chaflan(guia, (0, PILA_Y[0] - 0.2, PILA_Z[0] + 60), (0, 1, 1))
    s = union(s, guia)

    # --- X7: 2 costillas separadoras desde la espalda + ventanita + USB-C por la pared derecha
    for x in ((X7_X0, X7_X0 + 3), (X7_X1 - 6.5, X7_X1 - 3)):
        s = union(s, chaflan(bloque(x, (X7_CARA + 0.15, YI1 + 0.5), (X7_Z0 + 0.5, X7_Z1 - 0.5)), (0, YI1, X7_Z1 - 0.5), (0, -1, 1)))
    s = subtract(s, bloque(VENTANA['x'], (YI1 - 1, Y1 + 1), VENTANA['z'], 2.0))
    s = subtract(s, box((X_EXT, USB_Y, USB_Z), (PARED * 2 + 2, 7.5, 13.0), 2.5))

    # --- placa perforada: riel en la pared derecha + pilar con ranura a la izquierda
    py = PERFO['y']
    riel = bloque((PERFO['x'][1] - 1.0, XI), (py[0] - 1.5, py[1] + 1.5), (PERFO['z'][0] - 2, PERFO['z'][1] + 2))
    riel = subtract(riel, bloque((PERFO['x'][1] - 2, PERFO['x'][1] + 0.3), (py[0] - H, py[1] + H),
                                 (PERFO['z'][0] - 3, PERFO['z'][1] + 3)))
    pilar = bloque((PERFO['x'][0] - 2.5, PERFO['x'][0] + 1.0), (py[0] - 1.5, PILA_Y[0] - 0.2), (PERFO['z'][0], ZI_TOP + 0.5))   # llega hasta la guía de la pila (la sostiene)
    pilar = subtract(pilar, bloque((PERFO['x'][0] - 0.3, PERFO['x'][0] + 2), (py[0] - H, py[1] + H),
                                   (PERFO['z'][0] - 1, PERFO['z'][1] + 1)))
    riel = chaflan(riel, (XI, 0, PERFO['z'][1] + 2), (-1, 0, 1))
    s = union(s, riel, pilar)

    # --- interruptor (pared derecha, atrás)
    s = subtract(s, box((X_EXT, INT_Y, INT_Z), (PARED * 2 + 2, INT_A, INT_H), 0.5))

    # --- touch: pared adelgazada a 1 mm detrás de cada uno
    s = subtract(s, bloque((-TOUCH_A / 2 - H - 0.3, TOUCH_A / 2 + H + 0.3), (YI0 - 1.0, YI0 + 0.5),
                           (PANZA_Z - TOUCH_H / 2 - 0.5, PANZA_Z + TOUCH_H / 2 + 0.5)))
    ex, ez = ESPALDA
    s = subtract(s, bloque((ex - TOUCH_A / 2 - 0.5, ex + TOUCH_A / 2 + 0.5), (YI1 - 0.5, YI1 + 1.0),
                           (ez - TOUCH_H / 2 - 0.5, ez + TOUCH_H / 2 + 0.5)))

    # --- micrófono: agujerito en el techo, arriba al frente, con un aro que lo centra
    aro = subtract(cylinder((0, MIC_Y, ZI_TOP - 0.75), 7.05 + H + 1.2, 1.5),
                   cylinder((0, MIC_Y, ZI_TOP - 0.75), 7.05 + H, 3))
    s = union(s, intersect(aro, silueta(0.5, (Z_PISO, Z_TOP))))
    s = subtract(s, cylinder((0, MIC_Y, Z_TOP - 1), 0.9, 6))
    for a in range(6):                                   # adorno: 6 puntitos alrededor (no pasan)
        t = np.radians(a * 60 + 30)
        s = subtract(s, cylinder((3.2 * np.cos(t), MIC_Y + 3.2 * np.sin(t), Z_TOP), 0.7, 1.2))

    # --- pilares de los tornillos de la tapa de abajo
    for x, y in POSTES:
        p = union(cylinder((x, y, Z_PISO + POSTE_H / 2), POSTE_R, POSTE_H),
                  bloque((x - POSTE_R if x > 0 else -XI - 0.5, XI + 0.5 if x > 0 else x + POSTE_R),
                         (y - POSTE_R, y + POSTE_R), (Z_PISO, Z_PISO + POSTE_H)))
        p = chaflan(p, (np.sign(x) * XI, 0, Z_PISO + POSTE_H), (-np.sign(x), 0, 1))
        s = union(s, intersect(p, silueta(0.3, (Z_PISO, Z_TOP))))
        s = subtract(s, cylinder((x, y, Z_PISO + 4), 0.85, 9))
    return s


# ======================================================== TAPA DE ABAJO (se imprime plana)
def tapa():
    s = silueta(0, (Z_BOT, Z_PISO), r_arr=0.5)
    s = intersect(s, bloque((-50, 50), (-50, 60), (Z_BOT, Z_PISO)))
    for x, y in POSTES:
        s = subtract(s, cylinder((x, y, Z_PISO), 1.15, 6))
        s = subtract(s, cylinder((x, y, Z_BOT), 2.2, 2.4))           # rebaje para la cabeza del tornillo
    # costillitas donde apoya la pila (dejan pasar el cable de abajo)
    for y in (PILA_Y[0] + 3, PILA_Y[1] - 3):
        s = union(s, bloque((PILA_X[0] + 1, PILA_X[1] - 1), (y - 1, y + 1), (Z_PISO - 0.1, PILA_Z[0])))
    # bordecitos que ubican el MPU6050 (15,6 × 20) y el amplificador (17,7 × 17,7)
    for (x0, y0, ax, ay) in ((-17.0, 0.8, 20.0, 15.6), (4.0, 0.9, 17.7, 17.7)):
        marco = subtract(bloque((x0 - 1.2 - H, x0 + ax + 1.2 + H), (y0 - 1.2 - H, y0 + ay + 1.2 + H), (Z_PISO - 0.1, Z_PISO + 1.2)),
                         bloque((x0 - H, x0 + ax + H), (y0 - H, y0 + ay + H), (Z_PISO - 1, Z_PISO + 2)))
        s = union(s, marco)
    # ranura para apretar el botón S1 del X7 con un escarbadientes
    s = subtract(s, bloque((14.0, 28.0), (28.0, 32.0), (Z_BOT - 1, Z_PISO + 1), 1.0))
    # (sin patitas impresas: la tapa se imprime plana. Si querés, pegale 4 gomitas abajo.)
    return s


# ======================================================== BRAZO (se imprime acostado, cara de adentro arriba)
BRAZO_LARGO = 40.0
BRAZO_R = 5.5
BRAZO_ESP = 5.5
BRAZO_X0 = XI + TORRE + 0.4          # cara de adentro del brazo (apoya sobre la torre del servo)


def brazo(sx=1):
    x0 = sx * BRAZO_X0
    xc = x0 + sx * BRAZO_ESP / 2
    a = (xc, BR_Y, BR_EJE_Z)
    b = (xc, BR_Y, BR_EJE_Z - (BRAZO_LARGO - 2 * BRAZO_R))
    s = intersect(capsule(a, b, BRAZO_R, BRAZO_R + 0.8),
                  box((xc, BR_Y, BR_EJE_Z - 15), (BRAZO_ESP, 30, 80), 0.0))
    s = intersect(s, box((xc, BR_Y, BR_EJE_Z - 15), (BRAZO_ESP, 30, 80), 1.2))   # cantos suaves
    # bracito de 1 punta: centro hondo (3 mm + rampita) y canaleta del brazo (2 mm), apuntando hacia abajo
    hx = x0 + sx * (R.HUB_PROF / 2 - 0.01)
    s = subtract(s, cylinder((hx, BR_Y, BR_EJE_Z), R.HUB / 2, R.HUB_PROF, axis='x'))
    s = subtract(s, box((hx, BR_Y, BR_EJE_Z - R.RAMPA / 2), (R.HUB_PROF, R.HUB, R.RAMPA), 0))
    cx = x0 + sx * (R.HORN_PROF / 2 - 0.01)
    s = subtract(s, box((cx, BR_Y, BR_EJE_Z - R.HORN_L / 2), (R.HORN_PROF, R.HORN_W, R.HORN_L), 0))
    # tornillo central con rebaje para la cabeza
    s = subtract(s, cylinder((xc, BR_Y, BR_EJE_Z), 1.3, BRAZO_ESP + 2, axis='x'))
    s = subtract(s, cylinder((x0 + sx * BRAZO_ESP, BR_Y, BR_EJE_Z), 2.4, 3.0, axis='x'))
    return s


B_CARCASA = ((-X_EXT - 1, Y0 - 1, Z_PISO - 1), (X_EXT + 1, Y1 + 1, Z_TOP + 1))
B_TAPA = ((-X_EXT - 1, Y0 - 1, Z_BOT - 1), (X_EXT + 1, Y1 + 1, Z_PISO + 2))
B_BRAZO = ((BRAZO_X0 - 1, BR_Y - 8, BR_EJE_Z - BRAZO_LARGO), (BRAZO_X0 + BRAZO_ESP + 1, BR_Y + 8, BR_EJE_Z + 7))

if __name__ == '__main__':
    print(f'cuerpo {2*X_EXT:.1f} × {Y1-Y0:.1f} × {ALTO:.1f} mm · z {Z_BOT:.1f} .. {Z_TOP:.1f}')
    print(f'Robi entero: {R.EXT_Z - Z_BOT:.1f} mm de alto · con brazos {2*(BRAZO_X0+BRAZO_ESP):.1f} mm de ancho')
    print(f'servo NO: tapa z={NO_TAPA_Z:.1f} base z={NO_BASE_Z:.1f} orejas z={NO_OREJA_Z0:.1f}')
    print(f'brazos: eje z={BR_EJE_Z:.1f} (servo z {BR_BOT:.1f}..{BR_TOP:.1f}), base x=±{BR_BASE_X:.1f}')
    print(f'pila z {PILA_Z[0]:.1f}..{PILA_Z[1]:.1f} · parlante z {PAR_Z0:.1f}..{PAR_Z0+PAR[2]:.1f}')
    print(f'X7 x {X7_X0:.1f}..{X7_X1:.1f} z {X7_Z0:.1f}..{X7_Z1:.1f} · USB-C z={USB_Z:.1f}')
