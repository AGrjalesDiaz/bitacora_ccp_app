// Configuración de la app
let CATALOGO = [];
let CATALOGOS = { tipo2: [], bajos: [] };
let REGLAS = {
  bien: { label: "Bien (sin patología)", intervencion: "", capitulo: "", unidad: "", tipo_cantidad: "", cascada: null },
  panete: {
    label: "Muro sano — pañete no garantizable (antiguo/deteriorado)",
    intervencion: "Picar pañete existente, dejar bloque a la vista; repañetar + estucar + pintar de nuevo",
    capitulo: "1.2 Acabados — Repañete, estuco y pintura de muro",
    unidad: "m²", tipo_cantidad: "Total", cascada: null
  },
  fisura_mayor: {
    label: "Fisura mayor al umbral definido",
    intervencion: "Grapado en U + retiro total del pañete existente + repañetar + estucar + pintar",
    capitulo: "1.1 Mampostería — Grapado en U de fisura + 1.2 Acabados — Repañete, estuco y pintura de muro",
    unidad: "ml (grapado) / m² (acabado)", tipo_cantidad: "Parcial (grapado) + Total (acabado)", cascada: null
  },
  grieta_grave: {
    label: "Grieta grave / muro desplazado o desplomado",
    intervencion: "Demolición del muro + reposición con sistema liviano (Superboard)",
    capitulo: "1.3 Demolición y reposición de muro liviano (Superboard)",
    unidad: "m²", tipo_cantidad: "Total", cascada: "piso"
  }
};

const PISO_MATERIALES = ["Mármol", "Porcelanato", "Cerámica", "Laminado SPC", "Otro"];
const ENCHAPE_MATERIALES = ["Mármol", "Granito", "Acero inoxidable", "Cerámica", "Otro"];
const CIELO_RASO_TIPO = { "15": "Pañete + Estuco + Pintura (sobre torta inferior de placa)", "16": "Drywall" };
const CIELO_RASO_INTERVENCION = {
  "15": "Picar pañete afectado y rehacer pañete + estuco + pintura desde cero",
  "16": "Retiro y reposición de paneles de drywall afectados (nota: regla asumida, validar con criterio del ingeniero)"
};
const CIELO_RASO_TIPO_DEFAULT = "Por definir (pendiente confirmar sistema con el ingeniero)";
const CIELO_RASO_INTERVENCION_DEFAULT = "Por definir — reposición del cielo raso afectado (pendiente confirmar sistema y alcance con el ingeniero)";
function cieloRasoTipo(piso) { return CIELO_RASO_TIPO[piso] || CIELO_RASO_TIPO_DEFAULT; }
function cieloRasoIntervencion(piso) { return CIELO_RASO_INTERVENCION[piso] || CIELO_RASO_INTERVENCION_DEFAULT; }

// Grupos de catálogo por piso real. "tipo2" = planta tipo pisos 15-16 (catalogo_planta_tipo2.json).
// "bajos" = planta tipo pisos 6,7,8,10,11,13,14 (catalogo_pisos_6_7_8_10_11_13_14.json).
const PISO_GRUPO = { "15": "tipo2", "16": "tipo2", "6": "bajos", "7": "bajos", "8": "bajos", "10": "bajos", "11": "bajos", "13": "bajos", "14": "bajos" };
function grupoDePiso(piso) { return PISO_GRUPO[piso] || "tipo2"; }

const PISOS_DISPONIBLES = [
  { value: "6", label: "Piso 6" },
  { value: "7", label: "Piso 7" },
  { value: "8", label: "Piso 8" },
  { value: "10", label: "Piso 10" },
  { value: "11", label: "Piso 11" },
  { value: "13", label: "Piso 13" },
  { value: "14", label: "Piso 14" },
  { value: "15", label: "Piso 15" },
  { value: "16", label: "Piso 16" }
];

const OFICINAS_ORDEN = ["OF501", "OF502", "OF503", "OF504", "OF505", "OF506", "NUCLEO COMUN (ascensores/escalera)", "PUNTO FIJO"];
const OFICINAS_POR_GRUPO = {
  tipo2: OFICINAS_ORDEN,
  bajos: ["OF01", "OF02", "OF03", "OF04", "OF05", "OF06", "PASILLO", "FOSO ASCENSOR", "PUNTO FIJO"]
};
function oficinasDeGrupo(grupo) { return OFICINAS_POR_GRUPO[grupo] || OFICINAS_ORDEN; }

function grupoLabel(piso) {
  return grupoDePiso(piso) === "bajos"
    ? "Plantas pisos 6, 7, 8, 10, 11, 13 y 14"
    : "Planta Tipo II — Pisos 15 y 16";
}

let hallazgos = [];
let config = {};
let state = { tab: "captura", piso: "15", oficina: "OF501", tecnico: "", openEl: null };

// Cargar estado del navegador
try {
  state.tecnico = localStorage.getItem("ccp_tecnico") || "";
} catch (e) { }

// Utilidades
function uid() { return "h_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8); }
// Número de oficina física (1-6) a partir del código interno de catálogo OF501..OF506
function numeroOficina(o) {
  let m = /^OF50(\d)$/.exec(o);
  if (m) return m[1];
  m = /^OF0(\d)$/.exec(o);
  if (m) return m[1];
  return null;
}
// Código de espacio que usan los técnicos en el edificio: 1501-1506 (piso 15), 1601-1606 (piso 16), 601-606 (piso 6), etc.
function codigoEspacio() {
  const n = numeroOficina(state.oficina);
  if (n) return state.piso + "0" + n;
  if (state.oficina === "NUCLEO COMUN (ascensores/escalera)") return "NC" + state.piso;
  if (state.oficina === "PUNTO FIJO") return "PF" + state.piso;
  if (state.oficina === "PASILLO") return "PS" + state.piso;
  if (state.oficina === "FOSO ASCENSOR") return "FA" + state.piso;
  return "P" + state.piso + "-" + state.oficina;
}
function fmt(n) { return (Math.round(n * 100) / 100).toString(); }
function esc(s) { return (s == null ? "" : String(s)).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function ofLabel(o, piso) {
  piso = piso || state.piso;
  const n = numeroOficina(o);
  if (n) return "Oficina " + piso + "0" + n;
  if (o === "NUCLEO COMUN (ascensores/escalera)") return "Núcleo común (ascensores/escalera)";
  if (o === "PUNTO FIJO") return grupoDePiso(piso) === "tipo2" ? "Punto fijo (pendiente de levantamiento)" : "Punto fijo";
  if (o === "PASILLO") return "Pasillo";
  if (o === "FOSO ASCENSOR") return "Foso ascensor";
  return o;
}

function tipoLabel(t) {
  const map = {
    Muro: "Muros", Ventana: "Ventanas", "Antepecho+Ventana": "Antepecho + Ventana",
    MuroVentanaBaño: "Muro ventana (baño)", Rejilla: "Rejillas de fachada",
    Buitron: "Buitrones", Mesón: "Mesones de cocineta", Jardinera: "Jardineras",
    Columna: "Columnas", Piso: "Piso", CieloRaso: "Cielo raso"
  };
  return map[t] || t;
}

function elementosDe(oficina) {
  return CATALOGO.filter(e => e.oficina === oficina || e.secundaria === oficina);
}

function hallazgoDe(codigo_elemento, piso_real) {
  return hallazgos.find(h => h.codigo_elemento === codigo_elemento && h.piso_real === piso_real);
}

function estadoBadge(h) {
  if (!h) return `<span class="badge pend">Sin capturar</span>`;
  if (h.estado === "Afectado") return `<span class="badge bad">Afectado</span>`;
  if (h.estado === "Bien") return `<span class="badge ok">Bien</span>`;
  return `<span class="badge pend">${esc(h.estado || "")}</span>`;
}

function toast(msg) {
  let t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// Cargar datos
async function loadData() {
  try {
    // Cargar catálogos (tipo2 = pisos 15-16, bajos = pisos 6,7,8,10,11,13,14)
    const [catTipo2Res, catBajosRes] = await Promise.all([
      fetch('/api/catalogo?grupo=tipo2'),
      fetch('/api/catalogo?grupo=bajos')
    ]);
    CATALOGOS.tipo2 = await catTipo2Res.json();
    CATALOGOS.bajos = await catBajosRes.json();
    CATALOGO = CATALOGOS[grupoDePiso(state.piso)];
    console.log(`Catálogo tipo2: ${CATALOGOS.tipo2.length} elementos · Catálogo bajos: ${CATALOGOS.bajos.length} elementos`);

    // Cargar configuración
    const confRes = await fetch('/api/config');
    config = await confRes.json();
    console.log('Config cargada:', config);

    // Cargar hallazgos
    await refreshHallazgos();

    render();
  } catch (err) {
    console.error('Error cargando datos:', err);
    toast('Error cargando datos: ' + err.message);
  }
}

async function refreshHallazgos() {
  try {
    const res = await fetch('/api/hallazgos');
    hallazgos = await res.json();
    hallazgos.forEach(h => {
      if (h.fotos && typeof h.fotos === 'string') {
        h.fotos = JSON.parse(h.fotos);
      } else if (!h.fotos) {
        h.fotos = [];
      }
    });
    console.log(`Hallazgos cargados: ${hallazgos.length}`);
  } catch (err) {
    console.error('Error cargando hallazgos:', err);
    toast('Error cargando hallazgos');
  }
}

// Render
function render() {
  const app = document.getElementById("app");
  app.innerHTML = `
    ${topbar()}
    ${tabs()}
    <div id="tabcontent"></div>
    <div class="footer-note">Bitácora CCP — ${esc(grupoLabel(state.piso))}, Cámara de Comercio de Pereira · Numeración de capítulos en borrador</div>
  `;
  document.getElementById("tabcontent").innerHTML =
    state.tab === "captura" ? renderCaptura() :
      state.tab === "sabana" ? renderSabana() :
        state.tab === "memoria" ? renderMemoria() :
          state.tab === "ficha" ? renderFicha() : renderAjustes();
  wireEvents();
}

function topbar() {
  return `<div class="topbar">
    <div class="brand">
      <div class="mark">CCP</div>
      <div><h1>Bitácora de diagnóstico</h1><div class="sub">${esc(grupoLabel(state.piso))} · Cámara de Comercio de Pereira</div></div>
    </div>
    <div class="tecnico-field">Técnico: <input id="tecnicoInput" type="text" placeholder="Nombre" value="${esc(state.tecnico)}"></div>
  </div>`;
}

function tabs() {
  const t = [["captura", "Captura"], ["sabana", "Sábana"], ["memoria", "Memoria de cantidades"], ["ficha", "Ficha por oficina"], ["ajustes", "Ajustes"]];
  return `<div class="tabs">${t.map(([k, l]) => `<button class="tab ${state.tab === k ? 'active' : ''}" data-tab="${k}">${l}</button>`).join("")}</div>`;
}

function selectorPisoOficina() {
  const oficinas = oficinasDeGrupo(grupoDePiso(state.piso));
  return `<div class="card"><div class="row">
    <div class="field" style="max-width:140px"><label>Piso real</label>
      <select id="selPiso">${PISOS_DISPONIBLES.map(p => `<option value="${p.value}" ${state.piso === p.value ? "selected" : ""}>${p.label}</option>`).join("")}</select>
    </div>
    <div class="field"><label>Oficina / Zona</label>
      <select id="selOficina">${oficinas.map(o => `<option value="${o}" ${state.oficina === o ? "selected" : ""}>${esc(ofLabel(o, state.piso))}</option>`).join("")}</select>
    </div>
  </div></div>`;
}

function renderCaptura() {
  if (state.oficina === "PUNTO FIJO" && grupoDePiso(state.piso) === "tipo2") {
    var pfNote = `<div class="card"><div class="alert">Punto Fijo (M72, M74, M75, M76): pendiente de levantamiento — altura de muros y ventanas por definir. No se captura diagnóstico aquí hasta la visita de campo específica.</div></div>`;
  } else pfNote = "";
  const els = elementosDe(state.oficina);
  const grupos = {};
  els.forEach(e => { (grupos[e.tipo] = grupos[e.tipo] || []).push(e); });
  const orden = ["Muro", "Ventana", "Antepecho+Ventana", "MuroVentanaBaño", "Piso", "CieloRaso", "Buitron", "Mesón", "Jardinera", "Rejilla", "Columna"];
  let html = selectorPisoOficina() + pfNote + `<div class="card"><div style="font-size:12px;color:var(--text-dim);margin-bottom:4px">Espacio: <b style="color:var(--text)">${esc(codigoEspacio())}</b></div>`;
  orden.filter(t => grupos[t]).forEach(t => {
    html += `<div class="grupo-title">${tipoLabel(t)} (${grupos[t].length})</div>`;
    grupos[t].forEach(el => {
      const h = hallazgoDe(el.id, state.piso);
      const isSec = el.secundaria === state.oficina;
      const isShared = el.secundaria && el.secundina !== state.oficina;
      html += `<div class="elemento">
        <span class="id">${el.id}</span>
        <span class="desc">
          ${el.punto_fijo ? '<span class="badge pend">Pendiente</span>' : ''}
          ${isSec ? '<span class="sec">(comparte con ' + esc(el.oficina) + ')</span>' : ''}
          ${isShared ? '<span class="sec">(compartido)</span>' : ''}
          ${h && h.codigo_origen ? '<span class="origen-badge">auto — origen ' + esc(h.codigo_origen) + '</span>' : ''}
        </span>
        ${estadoBadge(h)}
        <div class="btns">
          <button class="btn small" data-open="${el.id}" ${el.punto_fijo ? 'disabled' : ''}>${h ? 'Editar' : 'Capturar'}</button>
        </div>
      </div>`;
      if (state.openEl === el.id) { html += formularioElemento(el, h); }
    });
  });
  html += `</div>`;
  return html;
}

let fotoStaging = {}; // { [elId]: { saved: [urls...], pendingFiles: [File...], pendingPreviews: [dataURL...] } }

function getFotoStaging(elId, h) {
  if (!fotoStaging[elId]) {
    fotoStaging[elId] = { saved: ((h && h.fotos) || []).slice(), pendingFiles: [], pendingPreviews: [] };
  }
  return fotoStaging[elId];
}

function fotosField(h, elId) {
  const st = getFotoStaging(elId, h);
  const total = st.saved.length + st.pendingFiles.length;
  const savedThumbs = st.saved.map((f, i) => `
    <div class="thumb-wrap">
      <img src="${f}">
      <button type="button" class="thumb-del" data-del-saved="${elId}|${i}" title="Eliminar foto">✕</button>
    </div>`).join("");
  const pendingThumbs = st.pendingPreviews.map((f, i) => `
    <div class="thumb-wrap">
      <img src="${f}">
      <span class="thumb-pend-badge">Pendiente</span>
      <button type="button" class="thumb-del" data-del-pending="${elId}|${i}" title="Quitar">✕</button>
    </div>`).join("");
  return `<div>
    <label style="font-size:11px;font-weight:600;color:var(--text-dim);text-transform:uppercase">Fotos (máx. 3) — ${total}/3</label>
    <div class="file-input-wrapper">
      <label class="file-label" for="fotoInput_${elId}" style="${total >= 3 ? 'opacity:.5;pointer-events:none' : ''}">Agregar foto</label>
      <input type="file" accept="image/*" capture="environment" multiple id="fotoInput_${elId}" ${total >= 3 ? 'disabled' : ''}>
    </div>
    <div class="thumbs" id="fotoThumbs_${elId}">${savedThumbs}${pendingThumbs}</div>
    <div class="note" style="margin-top:4px">Toma o selecciona varias fotos: cada una se agrega a la lista y todas se suben juntas al presionar Guardar. Usa la ✕ para quitar una foto antes de guardar.</div>
  </div>`;
}

function formularioElemento(el, h) {
  h = h || { codigo_elemento: el.id, codigo_espacio: codigoEspacio(), tipo_elemento: el.tipo, oficina: state.oficina, piso_real: state.piso, estado: "Bien", fotos: [] };
  let body = "";
  if (el.tipo === "Muro") {
    const sevKey = h.severidad_key || "bien";
    const regla = REGLAS[sevKey];
    body = `
      <div class="row">
        <div class="field"><label>Estado / Severidad</label>
          <select id="f_severidad">
            ${Object.entries(REGLAS).map(([k, r]) => `<option value="${k}" ${sevKey === k ? "selected" : ""}>${esc(r.label)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div id="reglaBox">${regla.intervencion ? `<div class="rule-box"><b>Intervención sugerida:</b> ${esc(regla.intervencion)}<br><b>Capítulo:</b> ${esc(regla.capitulo)}<br><b>Unidad:</b> ${esc(regla.unidad)} · <b>Tipo de cantidad:</b> ${esc(regla.tipo_cantidad)}</div>` : ""}</div>
      <div class="row" id="cantidadRow">
        ${sevKey !== "bien" ? `<div class="field"><label>Cantidad (m²)</label><input type="number" step="0.01" id="f_cantidad" value="${h.cantidad != null ? h.cantidad : ''}" placeholder="Longitud × altura"></div>` : ""}
      </div>
      ${sevKey === "fisura_mayor" ? `<div class="row">
        <div class="field"><label>Espesor medido (mm)</label><input type="number" step="0.1" id="f_espesor" value="${h.espesor_mm != null ? h.espesor_mm : ''}"></div>
        <div class="field"><label>Longitud grapado (ml)</label><input type="number" step="0.1" id="f_ml_grapado" value="${h.ml_grapado != null ? h.ml_grapado : ''}"></div>
      </div><div class="note">Umbral de referencia: ${config.umbral_fisura_mm || 5} mm (configurable en Ajustes).</div>` : ""}
      ${sevKey === "grieta_grave" ? `<div class="alert">Al guardar se generará automáticamente un hallazgo de <b>Piso</b> en esta oficina (demolición y reposición), y queda pendiente revisar en terreno interruptores, salidas y tomas embebidos en este muro.</div>` : ""}
    `;
  } else if (el.tipo === "Ventana" || el.tipo === "Antepecho+Ventana" || el.tipo === "MuroVentanaBaño") {
    body = `<div class="rule-box"><b>Regla fija:</b> reposición total por ventana nueva, sin importar el estado encontrado.</div>
      <div class="row">
        <div class="field"><label>Estado encontrado (referencia)</label>
          <select id="f_estado"><option value="Bien" ${h.estado === "Bien" ? "selected" : ""}>Bien</option><option value="Afectado" ${h.estado === "Afectado" ? "selected" : ""}>Afectado</option></select>
        </div>
        <div class="field"><label>Cantidad (und)</label><input type="number" id="f_cantidad" value="${h.cantidad != null ? h.cantidad : 1}"></div>
      </div>`;
  } else if (el.tipo === "Piso") {
    body = `<div class="row">
        <div class="field"><label>Material actual</label>
          <select id="f_material">${PISO_MATERIALES.map(m => `<option ${h.material === m ? "selected" : ""}>${m}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Estado</label>
          <select id="f_estado"><option value="Bien" ${h.estado === "Bien" ? "selected" : ""}>Bien</option><option value="Afectado" ${h.estado === "Afectado" ? "selected" : ""}>Afectado</option></select>
        </div>
        <div class="field"><label>Cantidad base (m²)</label><input type="number" step="0.01" id="f_cantidad" value="${h.cantidad != null ? h.cantidad : el.area_base_m2}"></div>
      </div>
      ${h.codigo_origen ? `<div class="alert">Generado automáticamente por demolición del muro ${esc(h.codigo_origen)}.</div>` : ""}
      <div class="field"><label>Patología (si afectado)</label>
        <select id="f_patologia"><option>Desgaste</option><option>Fisuras</option><option>Manchas</option><option>Demolición por muro asociado</option><option>Otro</option></select>
      </div>`;
  } else if (el.tipo === "CieloRaso") {
    const tipoFijo = cieloRasoTipo(state.piso);
    body = `<div class="rule-box"><b>Sistema (según piso ${state.piso}):</b> ${esc(tipoFijo)}</div>
      <div class="row">
        <div class="field"><label>Estado</label>
          <select id="f_estado"><option value="Bien" ${h.estado === "Bien" ? "selected" : ""}>Bien</option><option value="Afectado" ${h.estado === "Afectado" ? "selected" : ""}>Afectado (muy afectado)</option></select>
        </div>
        <div class="field"><label>Cantidad base (m²)</label><input type="number" step="0.01" id="f_cantidad" value="${h.cantidad != null ? h.cantidad : el.area_base_m2}"></div>
      </div>
      <div class="note">Si Afectado → intervención: ${esc(cieloRasoIntervencion(state.piso))}</div>`;
  } else if (el.tipo === "Buitron") {
    body = `<div class="rule-box"><b>Regla fija:</b> interior del buitrón sin intervención (queda cerrado). La cara hacia la oficina (muro MV) se interviene según la patología encontrada en ese muro.</div>
      <div class="field"><label>Observaciones de campo</label><textarea id="f_obs">${esc(h.observaciones || "")}</textarea></div>`;
  } else if (el.tipo === "Mesón") {
    body = `<div class="rule-box"><b>Regla fija:</b> reposición total del mesón (profundidad 0.6 m, longitud variable a medir).</div>
      <div class="row">
        <div class="field"><label>Material nuevo</label><select id="f_material">${ENCHAPE_MATERIALES.map(m => `<option ${h.material === m ? "selected" : ""}>${m}</option>`).join("")}</select></div>
        <div class="field"><label>Longitud (m)</label><input type="number" step="0.01" id="f_cantidad" value="${h.cantidad != null ? h.cantidad : ''}"></div>
      </div>`;
  } else {
    body = `<div class="field"><label>Estado</label>
        <select id="f_estado"><option value="Bien" ${h.estado === "Bien" ? "selected" : ""}>Bien</option><option value="Afectado" ${h.estado === "Afectado" ? "selected" : ""}>Afectado</option></select>
      </div>
      <div class="field"><label>Observaciones</label><textarea id="f_obs">${esc(h.observaciones || "")}</textarea></div>`;
  }
  return `<div class="panel" id="panel_${el.id}">
    ${body}
    ${fotosField(h, el.id)}
    <div class="row" style="margin-top:10px">
      <button class="btn primary" data-guardar="${el.id}">Guardar</button>
      <button class="btn" data-cerrar="1">Cancelar</button>
    </div>
  </div>`;
}

function renderSabana() {
  const rows = hallazgos.slice().sort((a, b) => (a.codigo_espacio || "").localeCompare(b.codigo_espacio || "") || (a.codigo_elemento || "").localeCompare(b.codigo_elemento || ""));
  return `<div class="card">
    <div class="row" style="margin-bottom:10px">
      <button class="btn" id="btnExportSabana">Exportar CSV — Sábana completa</button>
      <span style="font-size:12px;color:var(--text-dim);align-self:center">${rows.length} registros</span>
    </div>
    <div class="tablewrap"><table><thead><tr>
      <th>Espacio</th><th>Elemento</th><th>Tipo</th><th>Estado</th><th>Detalle</th><th>Capítulo</th><th>Cantidad</th><th>Origen</th><th>Técnico</th><th>Fotos</th>
    </tr></thead><tbody>
    ${rows.length ? rows.map(h => `<tr>
      <td>${esc(h.codigo_espacio)}</td><td><b>${esc(h.codigo_elemento)}</b></td><td>${esc(tipoLabel(h.tipo_elemento))}</td>
      <td>${estadoBadge(h)}</td>
      <td>${esc(h.severidad_label || h.patologia || h.material || "")}</td>
      <td style="max-width:220px">${esc(h.capitulo || "")}</td>
      <td>${h.cantidad != null ? fmt(h.cantidad) + " " + esc(h.unidad || "") : ""}</td>
      <td>${h.codigo_origen ? esc(h.codigo_origen) : "—"}</td>
      <td>${esc(h.tecnico || "")}</td>
      <td>${(h.fotos && h.fotos.length) || 0}</td>
    </tr>`).join("") : `<tr><td colspan="10" class="empty">Aún no hay hallazgos capturados.</td></tr>`}
    </tbody></table></div>
  </div>`;
}

function renderMemoria() {
  const afectados = hallazgos.filter(h => h.estado === "Afectado" && h.capitulo);
  const grupos = {};
  afectados.forEach(h => {
    const key = h.capitulo + "|" + (h.unidad || "");
    grupos[key] = grupos[key] || { capitulo: h.capitulo, unidad: h.unidad, cantidad: 0, n: 0 };
    grupos[key].cantidad += (parseFloat(h.cantidad) || 0);
    grupos[key].n += 1;
  });
  const lista = Object.values(grupos).sort((a, b) => a.capitulo.localeCompare(b.capitulo));
  return `<div class="card">
    <div class="row" style="margin-bottom:10px">
      <button class="btn" id="btnExportMemoria">Exportar CSV — Memoria de cantidades</button>
      <span style="font-size:12px;color:var(--text-dim);align-self:center">${lista.length} ítems agregados</span>
    </div>
    <div class="tablewrap"><table><thead><tr><th>Ítem / Capítulo</th><th>Unidad</th><th>Cantidad</th><th># hallazgos</th></tr></thead><tbody>
    ${lista.length ? lista.map(g => `<tr><td>${esc(g.capitulo)}</td><td>${esc(g.unidad)}</td><td><b>${fmt(g.cantidad)}</b></td><td>${g.n}</td></tr>`).join("") : `<tr><td colspan="4" class="empty">Ningún hallazgo "Afectado" capturado todavía.</td></tr>`}
    </tbody></table></div>
    <div class="note" style="margin-top:8px">El valor unitario (APU) se aplica aparte, en CESOFT, sobre estas cantidades — esta memoria se detiene en Cantidad, tal como define la metodología del proyecto.</div>
  </div>`;
}

function renderFicha() {
  const oficinasF = oficinasDeGrupo(grupoDePiso(state.piso));
  const h1 = `<div class="card"><div class="row">
    <div class="field" style="max-width:140px"><label>Piso real</label>
      <select id="selPisoF">${PISOS_DISPONIBLES.map(p => `<option value="${p.value}" ${state.piso === p.value ? "selected" : ""}>${p.label}</option>`).join("")}</select>
    </div>
    <div class="field"><label>Oficina</label>
      <select id="selOficinaF">${oficinasF.map(o => `<option value="${o}" ${state.oficina === o ? "selected" : ""}>${esc(ofLabel(o, state.piso))}</option>`).join("")}</select>
    </div>
  </div></div>`;
  const cod = codigoEspacio();
  const hs = hallazgos.filter(h => h.codigo_espacio === cod || h.codigo_espacio === `P${state.piso}-${state.oficina}`);
  const afectados = hs.filter(h => h.estado === "Afectado");
  const stat = `<div class="statline">
    <div class="stat"><div class="n">${elementosDe(state.oficina).length}</div><div class="l">Elementos en catálogo</div></div>
    <div class="stat"><div class="n">${hs.length}</div><div class="l">Capturados</div></div>
    <div class="stat"><div class="n">${afectados.length}</div><div class="l">Afectados</div></div>
  </div>`;
  const fotos = hs.flatMap(h => (h.fotos || []).map(f => ({ f, el: h.codigo_elemento })));
  return `${h1}<div class="card">
    <h3 style="margin:0 0 4px">Ficha técnica — ${esc(cod)}</h3>
    <div style="font-size:12px;color:var(--text-dim);margin-bottom:10px">Cámara de Comercio de Pereira · ${esc(grupoLabel(state.piso))}</div>
    ${stat}
    <div class="grupo-title">Hallazgos "Afectado"</div>
    <div class="tablewrap"><table><thead><tr><th>Elemento</th><th>Detalle</th><th>Cantidad</th><th>Capítulo</th></tr></thead><tbody>
    ${afectados.length ? afectados.map(h => `<tr><td><b>${esc(h.codigo_elemento)}</b></td><td>${esc(h.severidad_label || h.patologia || h.material || "")}</td><td>${h.cantidad != null ? fmt(h.cantidad) + " " + esc(h.unidad || "") : ""}</td><td>${esc(h.capitulo || "")}</td></tr>`).join("") : `<tr><td colspan="4" class="empty">Sin hallazgos afectados en esta oficina.</td></tr>`}
    </tbody></table></div>
    <div class="grupo-title">Registro fotográfico</div>
    <div class="thumbs">${fotos.length ? fotos.map(x => `<img src="${x.f}" title="${esc(x.el)}">`).join("") : '<div class="empty">Sin fotos</div>'}</div>
  </div>`;
}

function renderAjustes() {
  return `<div class="config-section">
    <h2 style="margin:0 0 12px">Configuración</h2>
    <div class="config-item">
      <label>Umbral de fisura (mm):</label>
      <input type="number" step="0.1" id="umbralInput" value="${config.umbral_fisura_mm || 5}">
      <button class="btn small" id="umbralGuardar">Guardar</button>
    </div>
  </div>`;
}

// Events
function wireEvents() {
  document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { state.tab = b.dataset.tab; state.openEl = null; render(); });
  const tecInput = document.getElementById("tecnicoInput");
  if (tecInput) tecInput.onchange = e => { state.tecnico = e.target.value; try { localStorage.setItem("ccp_tecnico", state.tecnico); } catch (err) { } };

  function cambiarPiso(nuevoPiso) {
    state.piso = nuevoPiso;
    CATALOGO = CATALOGOS[grupoDePiso(state.piso)];
    const oficinasValidas = oficinasDeGrupo(grupoDePiso(state.piso));
    if (!oficinasValidas.includes(state.oficina)) state.oficina = oficinasValidas[0];
  }

  const selPiso = document.getElementById("selPiso");
  if (selPiso) selPiso.onchange = e => { cambiarPiso(e.target.value); state.openEl = null; render(); };
  const selOficina = document.getElementById("selOficina");
  if (selOficina) selOficina.onchange = e => { state.oficina = e.target.value; state.openEl = null; render(); };
  const selPisoF = document.getElementById("selPisoF");
  if (selPisoF) selPisoF.onchange = e => { cambiarPiso(e.target.value); render(); };
  const selOficinaF = document.getElementById("selOficinaF");
  if (selOficinaF) selOficinaF.onchange = e => { state.oficina = e.target.value; render(); };

  document.querySelectorAll("[data-open]").forEach(b => b.onclick = () => {
    const nuevo = b.dataset.open;
    if (state.openEl && state.openEl !== nuevo) delete fotoStaging[state.openEl];
    state.openEl = (state.openEl === nuevo) ? null : nuevo;
    render();
  });
  document.querySelectorAll("[data-cerrar]").forEach(b => b.onclick = () => { if (state.openEl) delete fotoStaging[state.openEl]; state.openEl = null; render(); });

  const fSev = document.getElementById("f_severidad");
  if (fSev) fSev.onchange = () => {
    const el = CATALOGO.find(e => e.id === state.openEl);
    const h = hallazgoDe(state.openEl, state.piso) || {};
    h.severidad_key = fSev.value;
    document.getElementById("panel_" + state.openEl).outerHTML = formularioElemento(el, h);
    wirePanelOnly();
  };

  document.querySelectorAll("[data-guardar]").forEach(b => b.onclick = () => onGuardar(b.dataset.guardar));

  const btnEs = document.getElementById("btnExportSabana");
  if (btnEs) btnEs.onclick = () => exportCSV("sabana");
  const btnEm = document.getElementById("btnExportMemoria");
  if (btnEm) btnEm.onclick = () => exportCSV("memoria");

  const umbralGuardar = document.getElementById("umbralGuardar");
  if (umbralGuardar) umbralGuardar.onclick = async () => {
    const val = document.getElementById("umbralInput").value;
    try {
      await fetch(`/api/config/umbral_fisura_mm`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: val }) });
      config.umbral_fisura_mm = parseFloat(val);
      toast("Umbral actualizado a " + val + " mm");
    } catch (err) {
      toast("Error: " + err.message);
    }
  };

  if (state.openEl) { wireFotoInput(state.openEl); wireFotoDeleteButtons(state.openEl); }
}

function wirePanelOnly() {
  const fSev = document.getElementById("f_severidad");
  if (fSev) fSev.onchange = () => {
    const el = CATALOGO.find(e => e.id === state.openEl);
    const h = hallazgoDe(state.openEl, state.piso) || {};
    h.severidad_key = fSev.value;
    document.getElementById("panel_" + state.openEl).outerHTML = formularioElemento(el, h);
    wirePanelOnly();
  };
  document.querySelectorAll("[data-guardar]").forEach(b => b.onclick = () => onGuardar(b.dataset.guardar));
  document.querySelectorAll("[data-cerrar]").forEach(b => b.onclick = () => { if (state.openEl) delete fotoStaging[state.openEl]; state.openEl = null; render(); });
  if (state.openEl) { wireFotoInput(state.openEl); wireFotoDeleteButtons(state.openEl); }
}

function wireFotoInput(elId) {
  const inp = document.getElementById("fotoInput_" + elId);
  if (!inp) return;
  inp.onchange = () => {
    const st = fotoStaging[elId];
    if (!st) return;
    const total = st.saved.length + st.pendingFiles.length;
    const room = Math.max(0, 3 - total);
    const files = Array.from(inp.files || []).slice(0, room);
    if (files.length === 0) { inp.value = ""; return; }
    let pendientes = files.length;
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        st.pendingFiles.push(file);
        st.pendingPreviews.push(reader.result);
        pendientes--;
        if (pendientes === 0) {
          inp.value = "";
          const el = CATALOGO.find(e => e.id === elId);
          document.getElementById("panel_" + elId).outerHTML = formularioElemento(el, hallazgoDe(elId, state.piso));
          wirePanelOnly();
        }
      };
      reader.readAsDataURL(file);
    });
  };
}

function wireFotoDeleteButtons(elId) {
  document.querySelectorAll(`[data-del-saved^="${elId}|"]`).forEach(b => b.onclick = () => {
    const idx = parseInt(b.dataset.delSaved.split("|")[1], 10);
    fotoStaging[elId].saved.splice(idx, 1);
    const el = CATALOGO.find(e => e.id === elId);
    document.getElementById("panel_" + elId).outerHTML = formularioElemento(el, hallazgoDe(elId, state.piso));
    wirePanelOnly();
  });
  document.querySelectorAll(`[data-del-pending^="${elId}|"]`).forEach(b => b.onclick = () => {
    const idx = parseInt(b.dataset.delPending.split("|")[1], 10);
    fotoStaging[elId].pendingFiles.splice(idx, 1);
    fotoStaging[elId].pendingPreviews.splice(idx, 1);
    const el = CATALOGO.find(e => e.id === elId);
    document.getElementById("panel_" + elId).outerHTML = formularioElemento(el, hallazgoDe(elId, state.piso));
    wirePanelOnly();
  });
}

async function onGuardar(elId) {
  const el = CATALOGO.find(e => e.id === elId);
  const existing = hallazgoDe(elId, state.piso) || {};
  let doc = {
    codigo_elemento: elId, codigo_espacio: codigoEspacio(), tipo_elemento: el.tipo,
    oficina: state.oficina, piso_real: state.piso, tecnico: state.tecnico,
    fotos: existing.fotos || []
  };
  if (existing.codigo_origen) doc.codigo_origen = existing.codigo_origen;

  const val = id => { const n = document.getElementById(id); return n ? n.value : undefined; };

  if (el.tipo === "Muro") {
    const sevKey = val("f_severidad") || "bien";
    const regla = REGLAS[sevKey];
    doc.severidad_key = sevKey;
    doc.severidad_label = regla.label;
    doc.estado = sevKey === "bien" ? "Bien" : "Afectado";
    doc.intervencion = regla.intervencion;
    doc.capitulo = regla.capitulo;
    doc.unidad = regla.unidad;
    doc.tipo_cantidad = regla.tipo_cantidad;
    doc.cantidad = parseFloat(val("f_cantidad")) || null;
    if (sevKey === "fisura_mayor") {
      doc.espesor_mm = parseFloat(val("f_espesor")) || null;
      doc.ml_grapado = parseFloat(val("f_ml_grapado")) || null;
    }
  } else if (el.tipo === "Ventana" || el.tipo === "Antepecho+Ventana" || el.tipo === "MuroVentanaBaño") {
    doc.estado = val("f_estado") || "Bien";
    doc.capitulo = "1.7 Carpintería — Reposición de ventanas (regla fija: reposición total)";
    doc.unidad = "und";
    doc.cantidad = parseFloat(val("f_cantidad")) || 1;
    doc.severidad_label = "Reposición total (regla fija)";
  } else if (el.tipo === "Piso") {
    doc.material = val("f_material");
    doc.estado = val("f_estado") || "Bien";
    doc.cantidad = parseFloat(val("f_cantidad"));
    doc.unidad = "m²";
    doc.patologia = val("f_patologia");
    doc.capitulo = "1.4 Pisos — Demolición y reposición";
  } else if (el.tipo === "CieloRaso") {
    doc.estado = val("f_estado") || "Bien";
    doc.cantidad = parseFloat(val("f_cantidad"));
    doc.unidad = "m²";
    doc.tipo_sistema = cieloRasoTipo(state.piso);
    doc.intervencion = doc.estado === "Afectado" ? cieloRasoIntervencion(state.piso) : "";
    doc.capitulo = state.piso === "15" ? "1.5 Cielo raso — Pañete, estuco y pintura"
      : state.piso === "16" ? "1.6 Cielo raso — Drywall"
      : "1.5/1.6 Cielo raso — Sistema por definir (pendiente confirmar con el ingeniero)";
  } else if (el.tipo === "Buitron") {
    doc.estado = "Informativo";
    doc.observaciones = val("f_obs");
  } else if (el.tipo === "Mesón") {
    doc.material = val("f_material");
    doc.estado = "Afectado";
    doc.cantidad = parseFloat(val("f_cantidad"));
    doc.unidad = "m";
    doc.capitulo = "1.8 Cocinetas y baños — Mesón, enchapes y mueble (reposición total)";
    doc.severidad_label = "Reposición total (regla fija)";
  } else {
    doc.estado = val("f_estado") || "Bien";
    doc.observaciones = val("f_obs");
  }

  // Procesar fotos (cola de pendientes por subir + las ya guardadas que no se eliminaron)
  const staging = fotoStaging[elId] || { saved: existing.fotos || [], pendingFiles: [] };
  let fotosFinal = staging.saved.slice();
  for (const file of staging.pendingFiles) {
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const res = await fetch('/api/upload-photo', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        fotosFinal.push(data.url);
      } else {
        toast('Error subiendo foto: ' + (data.error || ('HTTP ' + res.status)));
      }
    } catch (err) {
      toast('Error subiendo foto: ' + err.message);
    }
  }
  if (fotosFinal.length > 3) fotosFinal = fotosFinal.slice(0, 3);
  doc.fotos = fotosFinal;

  // Guardar hallazgo
  try {
    const res = await fetch('/api/hallazgos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Cascada: si es muro con grieta_grave, generar hallazgo de piso
    if (el.tipo === "Muro" && doc.severidad_key === "grieta_grave") {
      const pisoEl = CATALOGO.find(e => e.tipo === "Piso" && e.oficina === state.oficina);
      if (pisoEl) {
        const pisoDoc = {
          codigo_elemento: pisoEl.id,
          codigo_espacio: codigoEspacio(),
          tipo_elemento: "Piso",
          oficina: state.oficina,
          piso_real: state.piso,
          tecnico: state.tecnico,
          estado: "Afectado",
          material: (hallazgoDe(pisoEl.id, state.piso) || {}).material || "Por definir",
          cantidad: pisoEl.area_base_m2,
          unidad: "m²",
          patologia: "Demolición por muro asociado",
          capitulo: "1.4 Pisos — Demolición y reposición",
          codigo_origen: elId,
          fotos: (hallazgoDe(pisoEl.id, state.piso) || {}).fotos || []
        };
        await fetch('/api/hallazgos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pisoDoc) });
        toast("Guardado. Se generó automáticamente el hallazgo de Piso por demolición del muro " + elId + ".");
      } else {
        toast("Guardado.");
      }
    } else {
      toast("Guardado.");
    }

    delete fotoStaging[elId];
    await refreshHallazgos();
    state.openEl = null;
    render();
  } catch (err) {
    console.error('Error guardando:', err);
    toast('Error guardando: ' + err.message);
  }
}

async function exportCSV(kind) {
  try {
    const url = kind === "sabana" ? "/api/export/sabana" : "/api/export/memoria";
    const res = await fetch(url);
    const csv = await res.text();
    const blob = new Blob([csv], { type: 'text/csv; charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = kind === "sabana" ? "sabana_bitacora_ccp.csv" : "memoria_cantidades_ccp.csv";
    link.click();
    toast("Archivo descargado.");
  } catch (err) {
    console.error('Error exportando:', err);
    toast('Error exportando: ' + err.message);
  }
}

// Iniciar
loadData();
