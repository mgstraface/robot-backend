"""Renders realistas de los robots armados y de las piezas."""
import sys

import ensamble as E
import huesito as Hs
import vendita as V
import nucleo as N
from render import Obj, render
from sdf import rotate, translate

HUESO = (0.88, 0.84, 0.74)
PIEDRA = (0.40, 0.40, 0.43)
PIEDRA_CLARA = (0.55, 0.55, 0.58)
NUCLEO = (0.10, 0.10, 0.11)
PANTALLA = (0.01, 0.01, 0.012)
VERDE = (0.55, 0.95, 0.35)
AMBAR = (1.0, 0.7, 0.2)
AZUL_SERVO = (0.12, 0.22, 0.62)
VENDA = (0.80, 0.74, 0.60)
ARENISCA = (0.60, 0.48, 0.32)


def mover(bbox, t):
    (x0, y0, z0), (x1, y1, z1) = bbox
    tx, ty, tz = t
    return ((x0 + tx, y0 + ty, z0 + tz), (x1 + tx, y1 + ty, z1 + tz))


TORSO_T = (0, E.TORSO_Y, E.TORSO_Z)


def escena_huesito(estilo='tierno'):
    B = Hs.BBOX
    C = E.CABEZA_ORIGEN
    return [
        Obj(E.pantalla(), PANTALLA, 0.15, emissive=E.ojos_emisivos(VERDE, estilo), bounds=mover(((-22, 0, -13), (22, 4, 13)), C)),
        Obj(E.en_cabeza(N.nucleo()), NUCLEO, 0.4, bounds=mover(N.BBOX_NUCLEO, C)),
        Obj(E.en_cabeza(Hs.mandibula()), HUESO, 0.5, bounds=mover(B['mandibula'], C)),
        Obj(E.en_cabeza(Hs.nuca()), HUESO, 0.5, bounds=mover(B['nuca'], C)),
        Obj(E.en_cabeza(Hs.craneo()), HUESO, 0.5, bounds=mover(B['craneo'], C)),
        Obj(translate(Hs.brazo_derecho(), E.BRAZO_DER_ORIGEN), HUESO, 0.55, bounds=mover(B['brazo_derecho'], E.BRAZO_DER_ORIGEN)),
        Obj(translate(Hs.brazo_izquierdo(), E.BRAZO_IZQ_ORIGEN), HUESO, 0.55, bounds=mover(B['brazo_izquierdo'], E.BRAZO_IZQ_ORIGEN)),
        Obj(E.en_torso(Hs.torso()), HUESO, 0.55, bounds=mover(B['torso'], TORSO_T)),
        Obj(E.servos(), AZUL_SERVO, 0.35, bounds=mover(((-40, -10, 30), (40, 20, 75)), TORSO_T)),
        Obj(Hs.lapida(), PIEDRA_CLARA, 0.85, bounds=B['lapida']),
        Obj(Hs.base(), PIEDRA, 0.9, bounds=B['base']),
    ]


def escena_vendita(estilo='terror'):
    B = V.BBOX
    C = E.CABEZA_ORIGEN
    return [
        Obj(E.pantalla(), PANTALLA, 0.15, emissive=E.ojos_emisivos(AMBAR, estilo), bounds=mover(((-22, 0, -13), (22, 4, 13)), C)),
        Obj(E.en_cabeza(N.nucleo()), NUCLEO, 0.4, bounds=mover(N.BBOX_NUCLEO, C)),
        Obj(E.en_cabeza(V.nuca()), VENDA, 0.8, bounds=mover(B['nuca'], C)),
        Obj(E.en_cabeza(V.cabeza()), VENDA, 0.8, bounds=mover(B['cabeza'], C)),
        Obj(translate(V.brazo_derecho(), E.BRAZO_DER_ORIGEN), VENDA, 0.8, bounds=mover(B['brazo_derecho'], E.BRAZO_DER_ORIGEN)),
        Obj(translate(V.brazo_izquierdo(), E.BRAZO_IZQ_ORIGEN), VENDA, 0.8, bounds=mover(B['brazo_izquierdo'], E.BRAZO_IZQ_ORIGEN)),
        Obj(E.en_torso(V.torso()), VENDA, 0.8, bounds=mover(B['torso'], TORSO_T)),
        Obj(E.servos(), AZUL_SERVO, 0.35, bounds=mover(((-40, -10, 30), (40, 20, 75)), TORSO_T)),
        Obj(V.base(), ARENISCA, 0.85, bounds=B['base']),
    ]


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'renders'
    size = (900, 1100)
    render(escena_huesito(), f'{out}/huesito_frente.png', cam=(130, -330, 190), target=(0, 0, 92), fov=32, size=size)
