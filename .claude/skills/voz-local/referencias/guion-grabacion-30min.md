# Guion de grabación para entrenar una voz (~30 min)

Guion pensado para **cobertura**, no para contenido. Da lo mismo lo que diga:
lo que importa es que el modelo escuche a la persona haciendo todas las cosas
que después le vas a pedir.

## Por qué existe este documento

Un fine-tune de voz falló (2026-08-19) con 8,8 min extraídos de una entrevista.
Al revisar el dataset apareció la causa real: **129 clips con cero preguntas y
cero exclamaciones**, y solo 11 con números. El modelo nunca escuchó a esa
persona hacer una entonación interrogativa — y se quebró justo en la frase que
empezaba con una pregunta, derivando al acento del modelo base.

La lección: **la composición pesa más que el total.** Treinta minutos leídos a
propósito valen más que sesenta de entrevista, porque una entrevista es
topicalmente estrecha y prosódicamente plana por naturaleza.

## Antes de grabar

- **Misma sala, mismo micrófono, misma distancia, toda la sesión.** La
  consistencia acústica importa más que la calidad absoluta. Un micrófono
  modesto y constante gana a uno bueno que cambia de posición.
- Sin música de fondo, sin otras voces, sin eco marcado.
- Pausa clara entre frases: facilita el troceo automático.
- Tono natural de conversación, no de locutor de radio — salvo en el bloque 6,
  que pide registros distintos a propósito.
- Si te equivocas, **para, respira, y repite la frase entera.** No arregles a
  media frase.
- Grabar en WAV o FLAC si se puede. Si es MP3/M4A, que sea de buena tasa.
- **Antes de empezar, deja grabada tu autorización en voz**: quién eres, para
  qué autorizas el uso de tu voz, y con qué límites. Queda en el mismo archivo.

## Meta de cobertura

| Objetivo | Cantidad |
|---|---|
| Duración total de habla | 28-35 min |
| Frases declarativas | ~40 % |
| **Preguntas** | ~15 % |
| **Exclamaciones / énfasis** | ~10 % |
| Números, fechas, montos | ~10 % |
| Nombres propios, siglas, extranjerismos | ~10 % |
| Frases muy cortas (< 6 palabras) | ~15 % |

---

## Bloque 1 — Declarativas neutras (~6 min)

Lee de corrido, tono informativo. Sirve de base: es el registro que el modelo
usará por defecto.

> El invierno llegó más temprano de lo que esperábamos y el camino quedó
> cubierto de nieve durante casi tres semanas.
>
> La biblioteca del pueblo abre de lunes a viernes, y los sábados solo por la
> mañana, cuando hay voluntarios disponibles.
>
> Prefiero cocinar sin receta. Voy probando, corrigiendo la sal, ajustando el
> fuego, hasta que algo funciona.
>
> El río cambia de color según la estación. En otoño se pone café, casi
> espeso, y en primavera vuelve a aclararse.
>
> Nadie me enseñó a hacer esto. Lo fui aprendiendo mirando, equivocándome, y
> preguntando cuando ya no quedaba otra.

_Continuar con 15-20 párrafos del mismo estilo. Sirve cualquier texto propio:
correos, notas, un capítulo de un libro que te guste._

## Bloque 2 — Preguntas (~4 min) — **CRÍTICO**

El bloque que faltó en el intento fallido. Lee cada una **como pregunta de
verdad**, con la curva melódica completa.

> ¿Y tú qué habrías hecho en mi lugar?
> ¿Cuánto falta para que lleguemos?
> ¿Estás seguro de que era por aquí?
> ¿Por qué nadie me avisó antes?
> ¿Quieres que te lo explique otra vez, o prefieres leerlo tú?
> ¿Sabes lo que más me sorprendió de todo esto?
> ¿Cómo se llamaba el lugar donde nos quedamos la primera vez?
> ¿Vale la pena seguir intentándolo?
> ¿Tú crees que se dio cuenta?
> ¿Qué pasa si no funciona?
> ¿A qué hora dijiste que empezaba?
> ¿De verdad piensas que fue casualidad?
> ¿No te parece raro que justo hoy?
> ¿Puedo hacerte una pregunta incómoda?
> ¿Y si probamos al revés?

_Repetir la tanda con distinta intención: curiosidad genuina, incredulidad,
impaciencia._

## Bloque 3 — Exclamaciones y énfasis (~3 min) — **CRÍTICO**

> ¡Qué frío hace!
> ¡No puede ser!
> ¡Cuidado con el escalón!
> ¡Eso es exactamente lo que quería decir!
> ¡Basta!
> ¡Por fin llegaste!
> ¡Qué bueno verte de nuevo!
> ¡No lo puedo creer!
> ¡Vamos, que ya falta poco!
> ¡Ahí está!

Y ahora las mismas ideas **sin** signos, solo con énfasis en una palabra:

> Eso. Eso es lo que estaba buscando.
> No era esa la idea. Para nada.
> Justo hoy. Tenía que ser justo hoy.

## Bloque 4 — Números, fechas y montos (~3 min)

Léelos **en palabras**, tal como están escritos.

> La reunión quedó para el martes treinta y uno de diciembre, a las nueve y
> media de la mañana.
>
> Son cuarenta y siete páginas, tres anexos, y un presupuesto de doce millones
> ochocientos mil pesos.
>
> El aumento fue de un quince coma cinco por ciento respecto del año pasado.
>
> Nací en mil novecientos ochenta y siete, en una ciudad de doscientos mil
> habitantes.
>
> Necesito veintiún metros de cable, dos rollos de cinta y una caja de tornillos.
>
> Llegamos a las siete menos cuarto y nos fuimos pasada la medianoche.
>
> De cada cien personas, sesenta y ocho respondieron que sí.
>
> El envío pesa tres coma cuatro kilos y mide sesenta por cuarenta por
> veinticinco centímetros.

## Bloque 5 — Nombres propios, siglas y extranjerismos (~3 min)

> Nos juntamos en Valparaíso, después de pasar por Concepción y Antofagasta.
> El informe lo firma Verónica Iturriaga, del área de Ingeniería.
> Trabajé con Joaquín, con Ximena y con el Nacho.
> Guarda el archivo en formato PDF y súbelo al servidor FTP.
> La API devuelve un JSON con el ID de cada usuario.
> Lo vimos en YouTube, en un video de unos diez minutos.
> Es un modelo de machine learning, entrenado con datos abiertos.
> El software corre sobre Linux, en un servidor con GPU.
> Marcela trabaja en la UNESCO desde el dos mil dieciocho.
> Nos escribimos por WhatsApp casi todos los días.

## Bloque 6 — Registros emocionales (~5 min)

Lee **el mismo párrafo** tres veces, cambiando solo la intención. Esto es lo que
le enseña al modelo que tu voz tiene más de un color.

> Al final resultó. Después de todos esos meses, después de todo lo que
> costó, resultó. Y ahora hay que ver qué hacemos con eso.

1. **Neutro informativo** — como si lo contaras en una reunión.
2. **Cálido y cercano** — como si se lo contaras a un amigo, sonriendo.
3. **Cansado, con peso** — más lento, más bajo, con pausas largas.

Repetir con estos dos:

> No sé si fue la decisión correcta. Todavía lo pienso, a veces, cuando no
> puedo dormir.

> Esto va a funcionar. Lo sé. Puede que no hoy, puede que no como lo
> imaginamos, pero va a funcionar.

## Bloque 7 — Frases cortas y ritmo quebrado (~3 min)

Las pausas son parte del contenido. Respeta los puntos suspensivos.

> Sí.
> No sé.
> Claro que sí.
> Espera... espera un segundo.
> No. Otra vez no.
> Ya está.
> ¿Ves? Te lo dije.
> Bueno. Ya veremos.
> Ahora sí.
> Un momento... déjame pensar.
> Perfecto.
> Nada. No pasa nada.
> Ahí vamos.
> Tal cual.
> Justo eso.

## Bloque 8 — Lectura corrida larga (~3 min)

Un texto seguido, sin cortes, para que el modelo aprenda cómo encadenas ideas y
dónde respiras naturalmente. Sirve un artículo, un cuento corto o un capítulo.
**Léelo entero, sin parar entre párrafos.**

---

## Después de grabar

1. **Verificar que no sea un loop.** Si el archivo es sospechosamente largo,
   correlación cruzada entre `t` y `t+P`. Un archivo de 37 min resultó ser una
   grabación de 9,96 min repetida 3,74 veces.
2. Transcribir con Whisper **`large-v3`**, nunca `small`.
3. Trocear con el pipeline de la Fase 5 de la skill.
4. **Revisar el dataset antes de entrenar**: contar clips con `?`, con `!` y con
   números. Si alguno da cero, el guion no se leyó completo.
