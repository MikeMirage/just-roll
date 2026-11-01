# Inferno Bowling

## Identidad

Una bola de bolera desciende por una interpretación libre y grotesca del infierno de Dante. La trazada es el combate: elegir el ángulo, esquivar el castigo, usar saltos y bordes para alcanzar formaciones y convertir un buen impacto en una reacción en cadena. El objetivo de cada descenso es vencer al guardián y atravesar su portal, con una puntuación que premie el dominio.

De las referencias se toma la presión y la legibilidad de Thumper, la expresividad y puntuación de Devil May Cry y la lectura inmediata de un runner como Talking Tom Gold Run. La dirección es continua; no hay tres carriles discretos. La música sostiene el ritmo, pero esta versión no exige pulsar a compás.

## Contrato de control

Avance automático y dirección lateral inmediata. El dedo o ratón eligen la posición horizontal; teclado y mando controlan velocidad lateral. Una acción: en suelo salta, en raíl se despega y en aire golpea hacia abajo. El golpe en caída amplifica el derribo cuando se usa cerca de una formación. Con furia completa se transforma en Hellstrike.

Se aceptan ayudas arcade para que la bola haga lo que el jugador entiende: resorte lateral amortiguado, tolerancia de salto, captura de borde y adhesión al looping. Los derribos mantienen físicas para generar cadenas interesantes. La cámara debe mostrar la siguiente decisión y conservar el sentido de izquierda/derecha al girar, sin vibración continua.

## Gramática de un descenso

Un nivel presenta, combina y examina un conjunto pequeño de movimientos. La dificultad viene de decidir una línea bajo presión, no de añadir botones continuamente.

1. Entrada: un grupo central fácil enseña qué significa un strike.
2. Alternancia: grupos laterales y bloqueos obligan a leer y cambiar de línea.
3. Riesgo: un barranco anunciado exige saltar, después permite volver al combate.
4. Expresión: puente roto con dos raíles; el borde concede velocidad y exige mantener la línea.
5. Espectáculo: un looping completo mantiene la orientación del control y conecta la siguiente decisión.
6. Combinación: segundo barranco, nuevos grupos y llegada al guardián.
7. Boss: tres oleadas con un objetivo de derribo y ataques distintos, seguidas por un portal.

No toda sección necesita todos los modificadores. Una secuencia de obstáculos sin ventanas para hacer bowling diluye la identidad. Las formaciones son recompensas y munición contra el boss; los modificadores cambian cómo se llega a ellas.

## Primer prototipo implementado

**El Umbral / Minos, el Juez**, una reinterpretación libre para validar el juego, no una recreación literal del poema. Recorrido de unos 53 segundos con 90 bolos, 15 grupos, dos barrancos, un puente de raíles y un looping. Cuatro vidas, puntos, combo hasta ×8, strikes, furia y Hellstrike. Minos tiene tres guardias de seis derribos y ofrece dos grupos por oleada. Un intento con derribos insuficientes repite la oleada, conserva el daño realizado al boss y pierde una vida. La puntuación se restaura para no poder farmear la repetición.

La simulación del runner es independiente del modo de carreras. Se reutilizan Three.js, Rapier, herramientas matemáticas y el motor de audio. El movimiento de la bola está restringido al espacio de la cinta; los bolos usan dinámica y contactos de Rapier. No hay bots ni objetivo de llegar antes que otro jugador.

## Campaña propuesta, todavía sin implementar

Los círculos deberían cambiar tanto la regla de bowling como el recorrido. Ejemplos de exploración:

| Familia de descenso | Giro jugable posible |
| --- | --- |
| Limbo / umbral | Lectura de formaciones, ángulo de entrada y cadenas básicas |
| Lujuria | Corrientes laterales y formaciones móviles con huecos amplios |
| Gula | Grupos densos, rebotes y elección entre rutas de acumulación |
| Avaricia | Riesgo por puntos: bancos laterales y apuestas de combo |
| Ira | Barreras que atacan por oleadas, desvíos y contraataques |
| Herejía | Alternancia de suelo seguro y superficies ardientes anunciadas |
| Violencia | Cadenas de raíles y saltos con objetivos en los aterrizajes |
| Fraude | Bifurcaciones que muestran claramente la recompensa y el peligro |
| Traición | Hielo controlable y cierre que combine recursos aprendidos |

Cada guardián necesita un patrón identificable, una respuesta que use el control existente y una vulnerabilidad expresada con bolos. La progresión puede desbloquear variaciones de impacto, cosméticos y retos de rango; no debería vender precisión ni obligar a acumular mejoras para que el control funcione.

## Qué medir al jugar

- Si alguien puede corregir una línea con un gesto sin sobrepasar el objetivo.
- Si un abismo o bloqueo se entiende antes del momento de actuar.
- Si se distingue un fallo propio de un derribo parcial causado por la física.
- Si el jugador busca un strike y una cadena, además de sobrevivir.
- Si Minos se entiende como un combate que se resuelve con bowling.

Antes de producir nueve niveles, conviene probar estas cinco preguntas con el descenso actual. El rendimiento y el tacto deben comprobarse también en teléfonos reales; las pruebas automatizadas y las ventanas de navegador de tamaño móvil no sustituyen esa comprobación.
