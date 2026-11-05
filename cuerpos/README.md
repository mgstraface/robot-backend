# Cuerpo de Robi (piezas 3D)

Modelos hechos en código (Python, SDF + marching cubes). Requiere numpy, scikit-image y matplotlib.

- `robi2.py`: Robi v2 (cabeza = pantalla): cabeza (frente + tapa) y cuello en U. Cabeza v1.2.2, tapa v1.3 (lugar del touch de la nuca), U v1.3.
- `robi2_cuerpo.py`: cuerpo v1 (carcasa + tapa de abajo) y brazos. `robi2_cuerpo_generar.py [carpeta]` genera los STL; `robi2_cuerpo_render.py salida.png frente|espalda|corte`.
- `robi2_generar.py [carpeta]`: genera los STL (env `PASO` = resolución, `SOLO` = una pieza).
- `robi2_render.py salida.png [angulo_si] [despiece]`: render de cómo queda.
- `medidas.py`: holgura (0,15 mm por lado, probada con `pruebas/encastre_servo`).
- `pruebas/MEDIDAS.md`: medidas reales tomadas con calibre.
- `stl/`: STL v1.2 listos para imprimir (A1 mini, PLA, 0.20 mm Standard, boquilla 0.4).
  - Cabeza: cara contra la cama, soportes en árbol "solo en la placa".
  - Tapa: plana, pilar para arriba. U: parada sobre la base.
  - Cuerpo: **boca abajo** (el techo contra la cama), sin soportes. Si el borde redondeado de la cama sale feo,
    soportes en árbol "solo en la cama".
  - Tapa de abajo: plana, como sale. Brazos: acostados, con el hueco del bracito para arriba.
- Archivos viejos (`huesito.py`, `nucleo.py`, `ensamble.py`, etc.): diseño anterior descartado.

Armado: placa por atrás → servo del SÍ deslizado en su ranura → tapa (2 tornillitos) →
servos a 90° (panel → Robot → Calibración) → bracitos con la cabeza derecha → U con tornillo
central (lado servo) y tornillo-bisagra (se enrosca en el pilar de la tapa).

Cuerpo v1 (5 nov 2026): 64 × 46 × 92 mm; Robi entero ~14,5 cm. Adentro: servo del NO arriba al centro (a lo largo
de x, tornillos desde abajo), servos de los brazos adelante a los costados, pila parada atrás a la izquierda,
parlante parado en el frente (suena por la "boquita" de abajo), X7 en la espalda (ventanita del display, USB-C por
la derecha, botón S1 con escarbadientes por la ranura de la tapa de abajo), perfo 30 × 40 parada al medio,
interruptor en la pared derecha atrás, mic en el techo adelante, touch en panza y espalda (pared de 1 mm),
MPU6050 y amplificador pegados en la tapa de abajo. A verificar en la primera impresión: ventanita y USB-C del X7.
