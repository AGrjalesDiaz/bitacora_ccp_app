# Bitácora CCP — Paquete de arranque para Claude Code

Este folder trae todo lo que Claude Code necesita para empezar a programar la app de diagnóstico de campo del edificio de la Cámara de Comercio de Pereira, sin tener que reconstruir nada de lo ya definido.

## Contenido

```
bitacora_ccp_app/
├── README.md                              este archivo
├── docs/
│   ├── ESPECIFICACION_APP.md              LEER PRIMERO — la especificación funcional completa
│   ├── Metodologia_CCP.docx               documento original de metodología (contexto de fondo)
│   └── Catalogo_Capa1_PlantaTipoII.xlsx   catálogo de cantidades ya construido en Excel (referencia)
├── data/
│   ├── catalogo_planta_tipo2.json         los 136 elementos del edificio, listos para sembrar la base de datos
│   └── reglas_derivacion.json             toda la lógica de patología → intervención → capítulo
└── reference/
    └── prototipo_ui.html                  prototipo funcional de interfaz (lógica de negocio ya resuelta)
```

## Cómo usar esto con Claude Code

1. Copia esta carpeta completa (`bitacora_ccp_app/`) dentro de la carpeta de tu proyecto (o úsala como la carpeta del proyecto directamente).
2. Abre una sesión de Claude Code en esa carpeta.
3. Pega el prompt de abajo tal cual.

## Prompt para pegar en Claude Code

```
Quiero que construyas una app web de captura de campo para un diagnóstico de patologías
constructivas en un edificio de oficinas (Cámara de Comercio de Pereira).

IMPORTANTE: esta app no va a correr en mi computador. Se tiene que poder publicar en
internet, en una URL fija, funcionando 24/7, para que cualquier técnico la abra desde el
celular en el sitio de la obra. Estoy dispuesto a pagar hosting (algo simple como Render,
Railway o Fly.io, con disco persistente para no perder la base de datos ni las fotos en
cada redeploy) y eventualmente un dominio propio. No propongas nada que solo sirva
corriendo en local o en una plataforma serverless sin almacenamiento persistente. Al
final, déjame instrucciones claras (o los archivos de configuración necesarios) de cómo
desplegar esto en la plataforma que elijas.

Antes de escribir una sola línea de código, lee completo docs/ESPECIFICACION_APP.md —
es la especificación funcional del proyecto y explica la arquitectura de datos ("la
sábana"), el catálogo de elementos, las reglas de derivación patología→intervención,
y qué está fuera de alcance. Después revisa data/catalogo_planta_tipo2.json (el dato
semilla) y data/reglas_derivacion.json (la lógica de negocio ya definida por el
ingeniero a cargo, no la reinventes). reference/prototipo_ui.html es un prototipo
funcional que ya resuelve toda la lógica de negocio y el flujo de pantallas — tiene una
limitación explicada en la sección 8 de la especificación (su capa de guardado es
específica de otro entorno y no sirve tal cual), pero su HTML/CSS, sus formularios por
tipo de elemento, y la cascada muro→piso son la referencia a seguir.

Construye:
1. Un backend con SQLite (Node+Express o Python+FastAPI, tú decides) que siembre la
   base de datos con el catálogo de data/catalogo_planta_tipo2.json y exponga endpoints
   para crear/leer/actualizar hallazgos según el modelo de "la sábana" descrito en la
   especificación (sección 2).
2. Un frontend simple, responsive (uso principal: celular en el sitio), con las cuatro
   pantallas de la sección 6: Captura, Sábana, Memoria de cantidades, Ficha por oficina.
   Puedes partir del HTML del prototipo y adaptarlo.
3. Guardado de fotos como archivos reales en disco (redimensionadas/comprimidas antes
   de subir), nunca como base64 en la base de datos.
4. Exportación a CSV de la Sábana completa y de la Memoria de cantidades agrupada por
   capítulo.
5. El mecanismo de "código de origen" para encadenar hallazgos (implementado ya para el
   caso Muro con severidad "grieta_grave" → genera hallazgo de Piso, pero déjalo
   genérico para que sea fácil agregar más cascadas después).

Antes de empezar, dime en qué orden vas a construir esto y si tienes alguna pregunta
sobre la especificación — no asumas nada sobre lo que no esté explícito ahí, pregúntame.
```

## Cosas que el ingeniero (Alejandro) todavía tiene pendiente definir

Estas NO bloquean el arranque de la app, pero sí hay que dejarlas fácilmente ajustables en el código y no fabricarlas como si fueran definitivas:

- El umbral exacto de espesor de fisura (mm) que separa "fisura mayor" de una fisura menor sin intervención estructural.
- La regla de intervención para cielo raso en drywall (piso 16) — hoy es una asunción razonable, no una definición confirmada por el ingeniero.
- La numeración oficial de capítulos/ítems del presupuesto (hoy son un borrador con prefijos "1.1", "1.2", etc.).
- En qué plataforma de hosting quedará publicada finalmente (Render, Railway, Fly.io u otra) y si ya se compró o se va a comprar un dominio propio — esto no bloquea el desarrollo, pero sí conviene decidirlo antes del primer despliegue real.
