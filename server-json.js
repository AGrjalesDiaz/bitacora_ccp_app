const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb' }));
app.use(express.static('public'));

// Directorios
// En Render, el disco persistente queda montado en /uploads (sobrevive a cada redeploy).
// En el computador local (npm run dev) esa carpeta no existe, así que se usa la carpeta del proyecto como antes.
const persistentBase = fs.existsSync('/uploads') ? '/uploads' : __dirname;
const dataDir = path.join(persistentBase, 'data-json');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
console.log(`✓ Guardando hallazgos en: ${dataDir}`);

// Carpeta de fotos — también en el disco persistente para que sobrevivan a cada redeploy
const fotosDir = path.join(persistentBase, 'fotos');
if (!fs.existsSync(fotosDir)) fs.mkdirSync(fotosDir, { recursive: true });
console.log(`✓ Guardando fotos en: ${fotosDir}`);
app.use('/fotos', express.static(fotosDir));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB por foto antes de comprimir
});

// Rutas de archivos de datos
const hallazgosFile = path.join(dataDir, 'hallazgos.json');
const configFile = path.join(dataDir, 'config.json');

// Cargar catálogo
let catalogo = [];
try {
  const rawData = fs.readFileSync(path.join(__dirname, 'data', 'catalogo_planta_tipo2.json'), 'utf-8');
  catalogo = JSON.parse(rawData);
  console.log(`✓ Catálogo cargado: ${catalogo.length} elementos`);
} catch (err) {
  console.error('Error cargando catálogo:', err.message);
  process.exit(1);
}

// Funciones de carga/guardado de datos
function loadData(file, defaultValue) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (err) {
    console.warn(`Warning: ${file} corrupto, usando valor por defecto`);
  }
  return defaultValue;
}

function saveData(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Error guardando ${file}:`, err.message);
    throw err;
  }
}

// Cargar datos
let hallazgos = loadData(hallazgosFile, []);
let config = loadData(configFile, { umbral_fisura_mm: 5 });

console.log(`✓ Hallazgos cargados: ${hallazgos.length}`);

// API Routes

app.get('/api/config', (req, res) => {
  res.json(config);
});

app.put('/api/config/:key', (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  config[key] = isNaN(value) ? value : parseFloat(value);
  saveData(configFile, config);
  res.json({ key, value });
});

app.get('/api/catalogo', (req, res) => {
  res.json(catalogo);
});

app.get('/api/hallazgos', (req, res) => {
  res.json(hallazgos);
});

app.get('/api/hallazgos/:piso_real/:codigo_elemento', (req, res) => {
  const { piso_real, codigo_elemento } = req.params;
  const h = hallazgos.find(x => x.piso_real === piso_real && x.codigo_elemento === codigo_elemento);
  if (!h) {
    res.status(404).json({ error: 'Hallazgo no encontrado' });
  } else {
    res.json(h);
  }
});

app.post('/api/hallazgos', (req, res) => {
  const doc = req.body;
  doc.fecha = new Date().toISOString();

  const idx = hallazgos.findIndex(h => h.piso_real === doc.piso_real && h.codigo_elemento === doc.codigo_elemento);
  if (idx >= 0) {
    hallazgos[idx] = { ...hallazgos[idx], ...doc };
  } else {
    hallazgos.push(doc);
  }

  saveData(hallazgosFile, hallazgos);
  res.json({ piso_real: doc.piso_real, codigo_elemento: doc.codigo_elemento, fecha: doc.fecha });
});

// POST /api/upload-photo — guarda la foto de verdad (comprimida) en el disco persistente
app.post('/api/upload-photo', upload.single('photo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió ninguna foto' });
  }
  try {
    const filename = `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const destPath = path.join(fotosDir, filename);
    await sharp(req.file.buffer)
      .rotate() // corrige la orientación según los datos EXIF del celular
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 78 })
      .toFile(destPath);
    res.json({ url: `/fotos/${filename}` });
  } catch (err) {
    console.error('Error guardando foto:', err.message);
    res.status(500).json({ error: 'No se pudo guardar la foto: ' + err.message });
  }
});

app.get('/api/export/sabana', (req, res) => {
  const cols = [
    'piso_real', 'codigo_espacio', 'codigo_elemento', 'tipo_elemento',
    'estado', 'severidad_label', 'material', 'patologia', 'intervencion',
    'capitulo', 'tipo_cantidad', 'cantidad', 'unidad', 'codigo_origen',
    'tecnico', 'fecha', 'observaciones'
  ];

  let csv = cols.map(c => `"${c}"`).join(',') + '\n';
  hallazgos.forEach(row => {
    const values = cols.map(c => {
      let v = row[c];
      if (v === null || v === undefined) v = '';
      if (typeof v === 'string' && (v.includes(',') || v.includes('"') || v.includes('\n'))) {
        v = '"' + v.replace(/"/g, '""') + '"';
      }
      return v;
    });
    csv += values.join(',') + '\n';
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=sabana_bitacora_ccp.csv');
  res.send(csv);
});

app.get('/api/export/memoria', (req, res) => {
  const afectados = hallazgos.filter(h => h.estado === 'Afectado' && h.capitulo);
  const grupos = {};
  afectados.forEach(h => {
    const key = h.capitulo + '|' + (h.unidad || '');
    if (!grupos[key]) {
      grupos[key] = { capitulo: h.capitulo, unidad: h.unidad, cantidad: 0, n: 0 };
    }
    grupos[key].cantidad += (parseFloat(h.cantidad) || 0);
    grupos[key].n += 1;
  });

  let csv = '"Item/Capitulo","Unidad","Cantidad","# hallazgos"\n';
  Object.values(grupos).sort((a, b) => a.capitulo.localeCompare(b.capitulo)).forEach(row => {
    const capitulo = (row.capitulo || '').replace(/"/g, '""');
    const unidad = (row.unidad || '').replace(/"/g, '""');
    const cantidad = (row.cantidad || 0).toFixed(2);
    const num = row.n || 0;
    csv += `"${capitulo}","${unidad}",${cantidad},${num}\n`;
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=memoria_cantidades_ccp.csv');
  res.send(csv);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', hallazgos: hallazgos.length });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n✓ Servidor ejecutándose en puerto ${PORT}`);
  console.log(`✓ Abre en navegador: http://localhost:${PORT}\n`);
});

process.on('SIGINT', () => {
  console.log('\n✓ Servidor detenido');
  process.exit(0);
});
