# Bitácora CCP — Especificación para desarrollo

Proyecto: diagnóstico, cuantificación y presupuesto de patologías constructivas en el edificio de la Cámara de Comercio de Pereira (CCP). Este documento es la especificación funcional para construir la app de captura de campo. Léelo completo antes de escribir código — el orden de las secciones importa, especialmente la sección "Arquitectura de datos", que es el corazón del sistema.

## 1. Objetivo

Una app que un técnico usa en sitio (celular/tablet) para recorrer oficina por oficina, registrar el inventario completo de elementos constructivos (no solo lo dañado), diagnosticar cada elemento afectado, y con eso alimentar tres entregables sin trabajo manual adicional: ficha técnica por oficina, memoria de cantidades por capítulo/actividad, y el listado de actividades que entra al presupuesto (Item, Descripción, Unidad, Cantidad — el valor unitario se aplica aparte, en un software externo de costeo, CESOFT, que NO es parte de este alcance).

## 2. Arquitectura de datos — "la sábana"

No uses tablas separadas por entregable. Todo cae en **una sola tabla plana** ("la sábana"): un registro por hallazgo de campo, con estas columnas:

| Campo | Tipo | Descripción |
|---|---|---|
| id | string | Identificador único del hallazgo |
| codigo_elemento | string | ID del elemento en el catálogo (ej. `M23`, `V4`, `PISO-OF503`) |
| codigo_espacio | string | `P{piso_real}-{oficina}` (ej. `P15-OF503`) — el mismo catálogo de elementos aplica dos veces, una para el piso real 15 y otra para el 16 |
| piso_real | "15" \| "16" | Ver sección 4 — es importante, cambia reglas de cielo raso |
| oficina | string | OF501..OF506, "NUCLEO COMUN (ascensores/escalera)", o "PUNTO FIJO" |
| tipo_elemento | string | Muro, Ventana, Antepecho+Ventana, MuroVentanaBaño, Piso, CieloRaso, Buitron, Mesón, Jardinera, Columna, Rejilla |
| estado | "Bien" \| "Afectado" \| "Informativo" | Estado general |
| severidad_key / severidad_label | string | Solo para Muro — ver reglas de derivación |
| patologia, material, intervencion | string | Según tipo de elemento |
| capitulo | string | A qué ítem de presupuesto pertenece (ver `data/reglas_derivacion.json`) |
| tipo_cantidad | "Total" \| "Parcial" | Total = usa la cantidad del catálogo (no se remide); Parcial = se mide en el sitio (ej. una fisura puntual) |
| cantidad, unidad | number, string | |
| codigo_origen | string \| null | Si este hallazgo es CONSECUENCIA de otro (ver mecanismo de cascada abajo), apunta al id de ese otro hallazgo |
| fotos | array de referencias a archivo | Ver sección 5 |
| tecnico, fecha | string | Quién y cuándo capturó |
| observaciones | string | Libre |

Los tres entregables son **vistas filtradas de esta misma tabla**, nunca copias:
- **Ficha técnica por oficina** = filtrar por `codigo_espacio`.
- **Memoria de cantidades** = filtrar por `estado = "Afectado"`, agrupar por `capitulo` + `unidad`, sumar `cantidad`.
- **Presupuesto (actividades)** = la memoria de cantidades tal cual, como Item/Descripción/Unidad/Cantidad. No calcules precio unitario ni total valorado — eso es fuera de alcance.

### Mecanismo de "código de origen" (cascada)

Un hallazgo puede generar automáticamente otro. El caso ya definido: si un Muro se marca con severidad `grieta_grave` (demolición), el sistema debe generar/actualizar automáticamente un hallazgo de tipo `Piso` en la misma oficina, con `codigo_origen` apuntando al muro, `estado = "Afectado"`, `cantidad` = el área base de piso de esa oficina (del catálogo), y mostrar una alerta no automatizable: "revisar en terreno instalaciones eléctricas embebidas antes de demoler". Este mecanismo debe quedar genérico en el código (no hardcodeado solo para este caso), porque es razonable que aparezcan más cascadas después.

## 3. Catálogo de elementos (dato semilla, ya construido — no rehacer)

Archivo: `data/catalogo_planta_tipo2.json` — 136 elementos ya identificados y clasificados a partir del levantamiento en AutoCAD de la Planta Tipo II (76 muros, 21 vanos, 4 rejillas, 6 buitrones, 8 piezas de mobiliario fijo, 9 columnas, más un elemento Piso y un elemento CieloRaso por cada una de las 6 oficinas). Cada elemento tiene: `id`, `tipo`, `oficina` (y `secundaria` cuando el elemento es compartido entre dos oficinas), y campos propios del tipo (`altura_fija`, `muro_asociado`, `area_base_m2`, etc.).

Este catálogo **aplica dos veces** — una vez para el piso real 15 y otra para el piso real 16 — porque ambos pisos comparten la misma geometría (fueron construidos con la misma planta tipo), pero **no comparten el mismo estado de conservación ni, en el caso del cielo raso, el mismo sistema constructivo** (ver sección 4). La app debe permitir capturar diagnóstico de forma completamente independiente para `P15-OF501` y `P16-OF501`, aunque el catálogo de elementos que se les muestra sea el mismo.

Cuatro muros (`M72`, `M74`, `M75`, `M76`, marcados con `"punto_fijo": true` en el catálogo) corresponden al núcleo de escalera/ascensores y están **pendientes de levantamiento** (altura y vanos sin definir) — la app no debe permitir capturar diagnóstico sobre ellos todavía, debe mostrarlos bloqueados con la etiqueta "Pendiente de levantamiento".

## 4. Reglas de derivación (patología → intervención → capítulo)

Archivo: `data/reglas_derivacion.json` — contiene, ya estructurado, todo lo siguiente (no lo reinventes, impleméntalo tal cual está ahí; solo pregunta si algo es ambiguo):

- **Muro**: único elemento con árbol de severidad real (Bien / pañete no garantizable / fisura mayor a un umbral configurable / grieta grave-desplome). Cada opción trae su intervención e ítem de presupuesto sugeridos. La opción de "grieta grave" dispara la cascada hacia Piso descrita arriba.
- **Ventanas, Antepecho+Ventana, MuroVentanaBaño**: reposición total fija, sin importar el estado. No construyas árbol de patología para estos — es innecesario y el usuario fue explícito en que se reemplazan sí o sí.
- **Piso**: dropdown de material existente + patología propia, o generado automáticamente por la cascada de un muro.
- **Cielo raso**: el sistema constructivo depende del `piso_real` (15 = pañete/estuco/pintura sobre la placa, 16 = drywall) — esto viene de un dato de campo real que el ingeniero dio explícitamente, no lo trates como el mismo elemento en ambos pisos. La regla de intervención para drywall (piso 16) está marcada en el JSON como "asunción pendiente de validar" — muéstrala en la UI con una nota visible de que es un borrador, no la presentes como definitiva.
- **Buitrones, Mesones, enchapes de baño, mobiliario de cocineta**: reposición total sin árbol de patología, solo un dropdown de material/especificación nueva.

Todos los nombres de "capítulo" en el JSON llevan un prefijo tipo `1.1`, `1.2`, etc. — son un **borrador**, así queda explícito en el propio archivo. No los trates como la numeración oficial del presupuesto (esa numeración vive en CESOFT y es un tema aparte, fuera de este alcance).

## 5. Fotos

Cada hallazgo puede llevar hasta 3 fotos tomadas con la cámara del dispositivo. Guárdalas como archivos reales en disco (o el storage que uses), no como base64 dentro del registro de base de datos — evita el problema de límite de tamaño de documento que tienen algunas bases NoSQL. Redimensiona a un ancho máximo razonable (600–800px) y comprime (JPEG calidad ~0.6) antes de guardar, para no llenar el disco con fotos de cámara de 12MP sin necesidad.

## 6. Pantallas requeridas

1. **Captura** (la principal, la que se usa en campo): selector de Piso real (15/16) y Oficina arriba; debajo, la lista de elementos de esa oficina agrupados por tipo, cada uno con su estado actual (badge Bien/Afectado/Sin capturar) y un botón para abrir el formulario de diagnóstico correspondiente a su tipo (ver sección 4). Debe funcionar bien en pantalla de celular.
2. **Sábana**: tabla completa de todos los hallazgos capturados, filtrable, exportable a CSV.
3. **Memoria de cantidades**: hallazgos "Afectado" agrupados por capítulo + unidad, con la cantidad sumada, exportable a CSV en formato Item/Descripción/Unidad/Cantidad.
4. **Ficha técnica por oficina**: filtro de la sábana por `codigo_espacio`, mostrando inventario, hallazgos afectados y registro fotográfico — pensada para poder imprimirse o exportarse a PDF/Word más adelante (no es indispensable resolver la exportación a Word en esta primera versión, pero la vista en pantalla sí debe existir).

## 7. Fuera de alcance (a propósito, no lo construyas)

- Precios unitarios, APU, presupuesto valorado — eso vive en CESOFT, un software externo. Esta app se detiene en cantidad.
- El levantamiento del "Punto Fijo" (M72/74/75/76) — pendiente de una visita de campo específica.
- Generación automática de Word/PDF de la ficha técnica — fase posterior.

## 8. Referencia de interfaz (no es la arquitectura final)

`reference/prototipo_ui.html` es un prototipo funcional que ya implementa toda la lógica de las secciones 2–6, incluyendo el formulario de cada tipo de elemento y la cascada muro→piso. **Su lógica de negocio y su interfaz son la referencia a seguir** — pero su capa de persistencia usa una API (`window.claude.use("db")`) exclusiva del entorno de Artifacts de Claude.ai y **no funcionará fuera de ese entorno**. Toma de este archivo el modelo de datos, las reglas, el flujo de pantallas y el HTML/CSS de la interfaz; reemplaza únicamente la capa de guardado/lectura de datos por la que corresponda a la arquitectura real del proyecto (ver sección 9).

## 9. Stack recomendado y despliegue (IMPORTANTE — leer antes de decidir arquitectura)

Esta app **no es para correr en la máquina de nadie** — tiene que quedar publicada en internet, en una URL fija, disponible 24/7, para que cualquier técnico la abra desde el celular en el sitio sin depender de que el computador de alguien esté prendido. El dueño del proyecto está dispuesto a pagar hosting (y eventualmente un dominio propio) para lograr esto — no busques la opción gratuita a toda costa si eso compromete que la app quede publicada y persistente.

Recomendado por sencillez de despliegue: **backend ligero (Node+Express o Python+FastAPI) con SQLite**, sirviendo un frontend HTML/JS simple (puede partir del prototipo de referencia), con fotos guardadas como archivos reales en disco (no base64) y exportación a CSV directa desde SQL. La razón para usar SQLite aquí (en vez de una base de datos gestionada aparte) es que simplifica el despliegue a un solo servicio — pero esto SOLO funciona si se despliega en un hosting que dé **disco persistente** (el archivo de la base de datos y las fotos deben sobrevivir a reinicios y redeploys). Plataformas que cumplen esto y son sencillas de configurar: **Render** (recomendado — planes con disco persistente desde ~7 USD/mes, fácil de conectar a un dominio propio), Railway o Fly.io (ambas con volúmenes persistentes). NO uses una plataforma serverless sin almacenamiento persistente (como el plan gratuito de Vercel o Netlify para funciones) — ahí SQLite se borra en cada redeploy y las fotos no sobreviven.

Al final del desarrollo, deja instrucciones claras (o un `Dockerfile` / `render.yaml`) de cómo desplegar el proyecto en la plataforma elegida, incluyendo cómo configurar el disco persistente. Si el usuario luego quiere conectar un dominio propio, eso se hace desde el panel del hosting elegido, apuntando el DNS del dominio hacia la app ya desplegada — es un paso independiente de la construcción de la app.

Si el desarrollador tiene una preferencia de stack distinta y justificada (por ejemplo, una base de datos gestionada tipo Postgres en vez de SQLite), puede proponerla, pero debe mantener siempre: la app queda publicada en una URL pública y persistente (no solo corriendo en local), datos en una sola tabla ("la sábana"), fotos como archivos no como base64, y cero pérdida de datos entre despliegues.
