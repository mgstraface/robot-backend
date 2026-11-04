# Cuerpo de Robi (piezas 3D)

Modelos hechos en código (Python, SDF + marching cubes). Requiere numpy, scikit-image y matplotlib.

- `robi2.py`: Robi v2 (cabeza = pantalla): cabeza (frente + tapa) y cuello en U. **Versión actual: v1.2**.
- `robi2_generar.py [carpeta]`: genera los STL (env `PASO` = resolución, `SOLO` = una pieza).
- `robi2_render.py salida.png [angulo_si] [despiece]`: render de cómo queda.
- `medidas.py`: holgura (0,15 mm por lado, probada con `pruebas/encastre_servo`).
- `pruebas/MEDIDAS.md`: medidas reales tomadas con calibre.
- `stl/`: STL v1.2 listos para imprimir (A1 mini, PLA, 0.20 mm Standard, boquilla 0.4).
  - Cabeza: cara contra la cama, soportes en árbol "solo en la placa".
  - Tapa: plana, pilar para arriba. U: parada sobre la base.
- Archivos viejos (`huesito.py`, `nucleo.py`, `ensamble.py`, etc.): diseño anterior descartado.

Armado: placa por atrás → servo del SÍ deslizado en su ranura → tapa (2 tornillitos) →
servos a 90° (panel → Robot → Calibración) → bracitos con la cabeza derecha → U con tornillo
central (lado servo) y tornillo-bisagra (se enrosca en el pilar de la tapa).
