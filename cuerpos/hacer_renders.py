"""Genera los renders de presentación (tarda unos minutos)."""
import sys
import ensamble as E
import renders as R
from render import render

out = sys.argv[1] if len(sys.argv) > 1 else 'renders'
size = (720, 880)
C = E.CABEZA_ORIGEN
render(R.escena_huesito('tierno'), f'{out}/huesito.png', cam=(130, -330, 190), target=(0, 0, 92), fov=32, size=size, ss=1)
render(R.escena_huesito('terror'), f'{out}/huesito_terror_atras.png', cam=(-210, 260, 200), target=(0, 0, 85), fov=32, size=size)
render(R.escena_vendita('terror'), f'{out}/vendita.png', cam=(150, -300, 170), target=(0, -5, 92), fov=32, size=size)
render(R.escena_vendita('tierno'), f'{out}/vendita_costado.png', cam=(-330, -120, 150), target=(0, 0, 88), fov=32, size=size)
