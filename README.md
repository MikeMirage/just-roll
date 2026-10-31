# JUST ROLL — Nexus Run

**[Jugar en el navegador](https://mikemirage.github.io/just-roll/)** · [Repositorio](https://github.com/MikeMirage/just-roll)

Prototipo de carreras arcade de canicas en Three.js y TypeScript, con físicas Rapier. El nivel principal, **Nexus Run**, enfrenta a una persona y 39 bots en un recorrido modular de salida a meta. Incluye bifurcaciones, splitter, saltos, túneles turbo, un embudo de tres salidas, un looping magnético de 80 metros de altura y reaparición con penalización. Se conservan cinco circuitos clásicos de ocho canicas y dos vueltas. La carrera se ejecuta localmente en el navegador.

## Ejecutar

Requiere una versión de Node.js compatible con Vite 8 (Node 22.12 o posterior).

```sh
npm install
npm run dev
```

Abre la dirección que muestra Vite. Para jugar desde un móvil conectado a la misma red, abre la dirección `Network` del terminal. El servidor de desarrollo escucha en todas las interfaces para permitir esta prueba.

```sh
npm run build   # TypeScript y compilación de producción
npm run preview # Servir la compilación
npm test        # Pruebas de simulación sin navegador
```

## Publicación en GitHub Pages

La rama `main` se publica mediante `.github/workflows/pages.yml`: instala con `npm ci`, ejecuta las pruebas, compila y despliega únicamente `dist/`. El trabajo de despliegue usa el entorno `github-pages` y no necesita claves guardadas en el repositorio. Cada `git push origin main` actualiza la web si las comprobaciones pasan; también se puede iniciar desde Actions con `workflow_dispatch`.

`vite.config.ts` genera rutas de recursos relativas para servir el juego dentro de `/just-roll/`. GitHub Pages debe usar **GitHub Actions** como origen. La versión publicada funciona mediante HTTPS y se puede abrir desde el móvil sin estar en la misma red que el ordenador.

## Controles

| Acción | PC | Móvil | Mando |
| --- | --- | --- | --- |
| Dirigir | Flechas izquierda/derecha o A/D | Mantener las flechas en pantalla | Stick izquierdo o cruceta |
| Turbo | Espacio o botón en pantalla | Botón TURBO | Botón A / botón principal |
| Pausar | Esc o botón de pausa | Botón de pausa | Start |

La canica avanza automáticamente. El turbo personal dura 2,6 segundos y tiene una sola carga por carrera. Los aceleradores verdes del suelo conceden impulso durante 1,5 segundos sin gastar esa carga. Admite mantener dirección y activar turbo a la vez mediante multitáctil. El navegador necesita una interacción para habilitar el audio.

## Circuitos y reglas

| Circuito | Carácter |
| --- | --- |
| **Nexus Run** | **40 canicas, 11 módulos, splitter de tres carriles, bifurcación segura/atajo con salto, dos túneles turbo, salto principal, embudo y looping magnético** |
| Neon Circuit | Recorrido urbano original, con algunos bordes abiertos |
| Crossfire | Ocho con cruce a dos alturas, separado por 42 metros |
| Helix Reactor | Dos espirales entrelazadas con cruce a distintas alturas |
| Solar Canyon | Trazado de eses y rectas entre agujas de roca |
| Skyfall | Recta elevada con una caída lateral a un tramo posterior inferior |

Se eligen desde el menú, también en móvil. Cada circuito tiene su mapa, longitud, ambiente, tempo musical y récord local. El selector reconstruye los recursos de pista y libera geometrías, materiales, texturas y mundo físico anteriores.

En los cinco circuitos clásicos, los **bordes ámbar no tienen barrera**. Se puede salir de ellos, conservar la velocidad de lanzamiento y aterrizar físicamente en otro tramo. El juego identifica el apoyo en 3D para distinguir una pista de la que pasa encima. No teletransporta la canica al tomar un atajo ni activa un motor invisible en el aire. En Skyfall, salir por la línea DROP LINE de la recta superior permite caer unos 46 metros sobre el tramo inferior y ahorrar más de 800 metros de recorrido, según la trayectoria.

En los circuitos clásicos, cada vuelta exige atravesar la puerta **LAP CHECK** y después la meta. Ambas se comprueban con el desplazamiento físico y la altura, para admitir saltos bajos y evitar contar el paso por otra plataforma. Aterrizar más adelante concede progreso, pero no atraviesa por sí solo una puerta omitida.

En los circuitos clásicos, **caer al vacío elimina**, en lugar de reaparecer inmediatamente. Los contactos entre canicas pueden expulsar rivales; se atribuye la eliminación al último rival que tuvo contacto físico en los cinco segundos anteriores. Gana quien completa las dos vueltas o queda como único superviviente. Las victorias por supervivencia no sustituyen el récord de vuelta completa. Si el jugador cae, aparece DNF y la carrera de los bots continúa de fondo. Solo se recupera automáticamente una canica que sigue sobre la pista pero lleva varios segundos atascada.

## Nexus Run: reglas y módulos

Es el nivel seleccionado por defecto al estrenar esta versión. La distancia de progreso entre salida y meta es de 3,46 km; cada rama tiene su propia longitud física. La prueba de 40 pilotos con conducción automática termina aproximadamente entre 111 y 131 segundos, según piloto. No es una garantía de tiempo con control manual.

1. Parrilla ancha de cinco columnas para 40 canicas.
2. Splitter con tres cintas físicas separadas que vuelven a reunirse.
3. Reagrupamiento y curva amplia.
4. Bifurcación: ruta de agarre más larga o ruta de titanio con acelerador y salto de 24 m.
5. Primer túnel turbo, con cubierta, paredes físicas y aceleradores de suelo.
6. Desviadores y zonas de goma.
7. Rampa con un salto principal de 26 m y aterrizaje ancho.
8. Vórtex: embudo descendente de 246°, con una calzada que se ensancha de 28 a 52 metros, peralte de hasta 31° y tres salidas de 9 metros cada una.
9. Segundo túnel turbo.
10. Orbital: looping vertical de 80 metros de altura, 28 metros de anchura y una salida desplazada lateralmente 44 metros respecto a la entrada.
11. Recta final y meta.

Los módulos y las ramas comparten una coordenada de progreso para clasificar rutas de diferente longitud. El apoyo físico identifica en qué cinta está cada canica; cámara, conducción, superficies y bots siguen esa cinta. Los huecos de salto carecen de suelo físico. En vuelo solo actúan gravedad, contactos y un control lateral débil.

Hay cinco puertas de control obligatorias, en orden, incluida una en la parte invertida del looping, y ocho puntos seguros de recuperación. **Caer o atascarse inicia una espera de 3 segundos** y devuelve al último punto seguro alcanzado. El cronómetro sigue durante esa espera, por lo que el tiempo final ya incluye la penalización: no se añade otra vez al resultado. Reaparecer no devuelve el turbo personal y elimina los efectos de aceleración que estuvieran activos. Al regresar hay 1,5 segundos de protección frente al contacto entre canicas; el suelo y las paredes siguen siendo sólidos.

El HUD muestra tramo, controles, posición sobre 40 y penalización acumulada. La clasificación lateral combina los primeros puestos y los rivales de tu posición; los resultados completos tienen desplazamiento. El minimapa representa las ramas y todos los participantes. En el looping, la cámara sigue el suelo en tres dimensiones, con giro continuo y espacio libre en la cara interior de la pista. Izquierda y derecha mantienen su sentido respecto a la pantalla incluso boca abajo. La cámara de Nexus se sitúa a 3 m en PC y 3,5 m en vertical, con algo más de distancia, y limita el FOV a 90°. Se mantienen la suavidad y la ausencia de vibración oscilante.

El **embudo** es una espiral de carrera abierta, no una cámara de espera: conserva anchura para adelantar y distribuye el pelotón entre tres cintas de salida. El estrechamiento, las superficies y las barreras usan la misma geometría en renderizado y colisiones. El pozo central, sus anillos y el faldón hundido bajo la barrera interior son decorativos; las canicas avanzan por el cuenco peraltado y las salidas.

El **looping** tiene suelo y barreras con orientación completa en 3D. Una comprobación de apoyo en la dirección normal del suelo funciona también en las paredes verticales y el techo. Mientras hay apoyo cercano, la asistencia magnética compensa la componente normal de la gravedad y refuerza la presión contra el suelo. Se conservan la gravedad en la pendiente, la dirección, la velocidad, los choques entre canicas y el progreso físico: no hay animación ni teletransporte alrededor del aro. Fuera del ancho de la pista o sin apoyo cercano desaparecen motor y adhesión; la canica cae y conserva la regla de recuperación. El turbo antes de la subida no consume la carga personal.

## Incluido

- Cuarenta canicas físicas en Nexus Run (un jugador y 39 bots), y ocho en los circuitos clásicos. Todos usan las mismas físicas y controles de dirección/turbo.
- Un nivel modular de salida a meta y cinco circuitos clásicos con desniveles, peraltes, pasos elevados, puertas de vuelta y clasificación por progreso/resultado.
- Carbono equilibrado, hielo deslizante, goma con más control y menor velocidad, y titanio de menor resistencia.
- Bumpers y obstáculos que se desplazan lateralmente, con movimiento compartido por todos los pilotos.
- Cámara amortiguada con anticipación de curva, campo de visión según velocidad, estelas y efectos de turbo.
- Cámara a 2,35 m en PC y 3 m en vertical, FOV progresivo hasta 92° con turbo y anticipación adaptada al radio de la curva. El encuadre deja más margen para leer la pista y reduce el avance/inclinación de la cámara al acelerar. Filtra pequeños botes, suaviza orientación y altura e interpola rotación/sombras entre pasos físicos. Los contactos usan una respuesta breve sin oscilación, y las estelas mantienen la misma duración a distintas tasas de refresco.
- Conducción de velocidad moderada: objetivo de 58 m/s en rectas para el jugador y 24 m/s adicionales de turbo, con aceleración y empuje de los pads ajustados para conservar control. El motor anticipa curvas cerradas, adapta la velocidad automáticamente y conserva aceleraciones e inercias físicas. El HUD muestra la velocidad medida en la simulación, sin multiplicadores de presentación. La velocidad alcanzada depende de curvas, pendientes, superficies y choques.
- Referencias próximas: postes de borde cada 9 m, marcas cada 8 m, portales cada 48 m y tramos de cubierta cada 12 m, además de estructuras próximas fuera del trazado. Los portales se dibujan mediante instancias para reducir llamadas de renderizado.
- Desenfoque radial suave en la periferia, con protección de la canica y del centro de la trazada. No acumula imágenes anteriores. Se desactiva en modo rendimiento y al reducir movimiento. Sonido de aire y armónico de motor según la velocidad, con barrido de aire al pasar por aceleradores.
- Cuenta atrás, pausa, reinicio, resultados, récord local, minimapa y HUD adaptable.
- Banda sonora electro/acid original, con percusión, bajo resonante, sintetizadores, transiciones e intensidad según velocidad y turbo. Se sintetiza en Web Audio; no descarga grabaciones.
- Bocina digital polifónica para 3–2–1 y una nota final más larga y aguda. Síntesis original, sin muestras de otros videojuegos.
- Volúmenes independientes de música y efectos, guardados localmente, y botones de escucha en Ajustes.
- Modo rendimiento automático/manual y ajuste para reducir movimiento.

## Organización

- `src/game/circuits.ts`: seis trazados, ambientes, música y secciones de barrera abierta.
- `src/game/modular.ts`: definición de los once módulos, cintas alternativas, rampas, huecos, embudo de anchura variable y bases 3D del looping de Nexus Run.
- `src/render/modular-course.ts`: geometría y señalización de ramas, túneles, rampas, embudo, estructura orbital, controles, postes y marcadores mediante instancias.
- `src/game/tuning.ts`: velocidad, aceleración, gravedad, asistencia en curvas y respuesta lateral compartidas por la simulación.
- `src/game/track.ts`: recorrido, bases locales, superficies, aceleradores, obstáculos y localización de aterrizajes. No depende de Three.js.
- `src/game/simulation.ts`: física a 60 Hz, conducción asistida, bots, turbo, eventos y reglas. No depende del DOM ni de Three.js.
- `src/render/scene.ts`: escena Three.js, geometría generada a partir de la pista, canicas, estelas, cámara y calidad visual.
- `src/render/chase-camera.ts`: seguimiento suave, anticipación de curvas, encuadre bajo, transición de vuelo y FOV progresivo.
- `src/render/track-details.ts`: pórticos, cubiertas, referencias de borde y estructuras cercanas, dibujadas mediante instancias.
- `src/render/velocity-pass.ts`: desenfoque periférico espacial que mantiene nítida la canica.
- `src/game/audio.ts`: mezcla, efectos y bocina mediante Web Audio.
- `src/game/soundtrack.ts`: partitura y secuenciador de electro/acid, con planificación anticipada mediante el reloj de audio.
- `src/main.ts`: entrada de teclado, Pointer Events y mando, estados de aplicación e interfaz.
- `tests/simulation.test.ts`: controles según cámara, turbo y ganancia de velocidad física, pausa/reinicio, aceleradores, suavidad del peralte, carreras completas en los cinco circuitos, cruces a dos alturas, caída balística real, validación de puertas/meta y expulsión física de un oponente.

`tests/spectacle.test.ts` comprueba la continuidad de las bases en vertical y boca abajo, el pelotón compacto de 40 canicas en embudo y looping a dos velocidades, ausencia de colas prolongadas, control invertido obligatorio, caída sin adhesión fuera de pista, cámara y dirección relativas a la pantalla al conducir boca abajo.

`tests/modular.test.ts` comprueba la carrera completa de 40 pilotos, todas las ramas, vuelo y aterrizaje de los 40, elección manual de ruta, puertas obligatorias y recuperación/cámara con penalización.

Las geometrías y texturas del circuito se generan en código. Las fuentes Barlow se cargan desde Google Fonts, con fuentes locales de reserva. No se usan recursos de Montblanc ni de Wipeout.

## Revisión visual de los módulos

Con Vite en marcha, `/tests/visual/?section=funnel` y `/tests/visual/?section=loop` abren una escena de revisión con 40 canicas agrupadas. Usa las mismas físicas y renderizado que el juego; permite pausar, reproducir, reiniciar o avanzar un segundo para examinar entradas, salidas y la parte invertida. Esta página está fuera del flujo del producto y de la entrada de producción.

## Límites de esta entrega

La simulación corre localmente: todavía no hay servidor, salas ni multijugador entre personas. Los bots comparten físicas y controles, aunque pueden consultar por adelantado la definición del recorrido para planificar. En Nexus Run eligen carriles y ambas ramas, incluida la ruta de salto; en los circuitos clásicos no planifican los atajos aéreos libres de Skyfall. La asistencia de avance y curvatura sobre el suelo está ajustada para conducción arcade; en vuelo solo hay gravedad, inercia, contactos y un control lateral débil. El núcleo separado permite reutilizar las reglas en un futuro servidor, pero predicción, reconciliación y sincronización de contactos requerirán una implementación y pruebas específicas.

La interfaz se puede comprobar a tamaños de móvil en un navegador de escritorio; el rendimiento y el multitáctil deben verificarse también en dispositivos iOS/Android reales. WebGL 2 es necesario. El prototipo no incluye cuentas, desbloqueos persistentes ni editor de pistas.
