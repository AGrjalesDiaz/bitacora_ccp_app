const express = require('express');
const Database = require('better-sqlite3');
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

// Crear carpeta de uploads si no existe
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configurar multer
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, name);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Inicializar BD
let db = null;

function initDb() {
  try {
    db = new Database(path.join(__dirname, 'data.db'));
    console.log('Base de datos abierta');
    createTables();
    return Promise.resolve();
  } catch (err) {
    console.error('Error abriendo BD:', err);
    return Promise.reject(err);
  }
}

function createTables() {
  // Tabla de configuración
  db.exec(`CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  // Tabla de catálogo de elementos
  db.exec(`CREATE TABLE IF NOT EXISTS catalogo (
    id TEXT PRIMARY KEY,
    tipo TEXT,
    oficina TEXT,
    secundaria TEXT,
    altura_fija REAL,
    punto_fijo BOOLEAN,
    muro_asociado TEXT,
    area_base_m2 REAL,
    profundidad_fija REAL,
    tipo_buitron TEXT,
    ubicacion TEXT,
    data JSON
  )`);

  // Tabla de hallazgos ("la sábana")
  db.exec(`CREATE TABLE IF NOT EXISTS hallazgos (
    piso_real TEXT NOT NULL,
    codigo_elemento TEXT NOT NULL,
    codigo_espacio TEXT,
    oficina TEXT,
    tipo_elemento TEXT,
    estado TEXT,
    severidad_key TEXT,
    severidad_label TEXT,
    patologia TEXT,
    material TEXT,
    intervencion TEXT,
    capitulo TEXT,
    unidad TEXT,
    tipo_cantidad TEXT,
    cantidad REAL,
    codigo_origen TEXT,
    espesor_mm REAL,
    ml_grapado REAL,
    observaciones TEXT,
    tecnico TEXT,
    fecha TEXT,
    fotos JSON,
    PRIMARY KEY (piso_real, codigo_elemento)
  )`);

  // Índices para búsquedas rápidas
  db.exec(`CREATE INDEX IF NOT EXISTS idx_hallazgos_espacio ON hallazgos(codigo_espacio)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_hallazgos_estado ON hallazgos(estado)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_hallazgos_capitulo ON hallazgos(capitulo)`);

  // Insertar valor por defecto de configuración
  const stmt = db.prepare(`INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)`);
  stmt.run('umbral_fisura_mm', '5');
}

// API Routes

// GET /api/config — obtener configuración
app.get('/api/config', (req, res) => {
  try {
    const stmt = db.prepare(`SELECT * FROM config`);
    const rows = stmt.all();
    const config = {};
    rows.forEach(row => {
      config[row.key] = isNaN(row.value) ? row.value : parseFloat(row.value);
    });
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/config/:key — actualizar configuración
app.put('/api/config/:key', (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  try {
    const stmt = db.prepare(`INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)`);
    stmt.run(key, String(value));
    res.json({ key, value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/catalogo — obtener catálogo de elementos
app.get('/api/catalogo', (req, res) => {
  try {
    const stmt = db.prepare(`SELECT data FROM catalogo`);
    const rows = stmt.all();
    const catalogo = rows.map(row => JSON.parse(row.data));
    res.json(catalogo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hallazgos — obtener hallazgos (sin filtro o con filtro opcional)
app.get('/api/hallazgos', (req, res) => {
  const { piso_real, oficina } = req.query;
  let query = `SELECT * FROM hallazgos`;
  let params = [];

  if (piso_real) {
    query += ` WHERE piso_real = ?`;
    params.push(piso_real);
  }

  if (oficina) {
    query += (piso_real ? ` AND` : ` WHERE`) + ` (oficina = ? OR codigo_espacio LIKE ?)`;
    params.push(oficina, `%-${oficina}`);
  }

  try {
    const stmt = db.prepare(query);
    const rows = params.length ? stmt.all(...params) : stmt.all();
    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hallazgos/:piso_real/:codigo_elemento — obtener hallazgo específico
app.get('/api/hallazgos/:piso_real/:codigo_elemento', (req, res) => {
  const { piso_real, codigo_elemento } = req.params;
  try {
    const stmt = db.prepare(
      `SELECT * FROM hallazgos WHERE piso_real = ? AND codigo_elemento = ?`
    );
    const row = stmt.get(piso_real, codigo_elemento);
    if (!row) {
      res.status(404).json({ error: 'Hallazgo no encontrado' });
    } else {
      if (row.fotos) {
        row.fotos = JSON.parse(row.fotos);
      }
      res.json(row);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hallazgos — crear o actualizar hallazgo
app.post('/api/hallazgos', (req, res) => {
  const {
    piso_real, codigo_elemento, codigo_espacio, oficina, tipo_elemento,
    estado, severidad_key, severidad_label, patologia, material, intervencion,
    capitulo, unidad, tipo_cantidad, cantidad, codigo_origen,
    espesor_mm, ml_grapado, observaciones, tecnico, fotos
  } = req.body;

  const fecha = new Date().toISOString();
  const fotosJson = fotos ? JSON.stringify(fotos) : null;

  try {
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO hallazgos
       (piso_real, codigo_elemento, codigo_espacio, oficina, tipo_elemento, estado,
        severidad_key, severidad_label, patologia, material, intervencion, capitulo,
        unidad, tipo_cantidad, cantidad, codigo_origen, espesor_mm, ml_grapado,
        observaciones, tecnico, fecha, fotos)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
      piso_real, codigo_elemento, codigo_espacio, oficina, tipo_elemento, estado,
      severidad_key, severidad_label, patologia, material, intervencion, capitulo,
      unidad, tipo_cantidad, cantidad || null, codigo_origen || null, espesor_mm || null,
      ml_grapado || null, observaciones || null, tecnico || null, fecha, fotosJson
    );
    res.json({ piso_real, codigo_elemento, fecha });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/upload-photo — guardar foto comprimida
app.post('/api/upload-photo', upload.single('photo'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No se envió foto' });
    return;
  }

  try {
    const inputPath = req.file.path;
    const outputFilename = `compressed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const outputPath = path.join(uploadsDir, outputFilename);

    await sharp(inputPath)
      .resize(640, null, { withoutEnlargement: true })
      .jpeg({ quality: 60 })
      .toFile(outputPath);

    // Eliminar archivo original sin comprimir
    fs.unlinkSync(inputPath);

    const photoUrl = `/uploads/${outputFilename}`;
    res.json({ url: photoUrl });
  } catch (err) {
    console.error('Error comprimiendo foto:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/export/sabana — exportar CSV de la sábana completa
app.get('/api/export/sabana', (req, res) => {
  try {
    const stmt = db.prepare(`SELECT * FROM hallazgos ORDER BY codigo_espacio, codigo_elemento`);
    const rows = stmt.all();

    const cols = [
      'piso_real', 'codigo_espacio', 'codigo_elemento', 'tipo_elemento',
      'estado', 'severidad_label', 'material', 'patologia', 'intervencion',
      'capitulo', 'tipo_cantidad', 'cantidad', 'unidad', 'codigo_origen',
      'tecnico', 'fecha', 'observaciones'
    ];

    let csv = cols.map(c => `"${c}"`).join(',') + '\n';
    rows.forEach(row => {
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/export/memoria — exportar CSV de memoria de cantidades
app.get('/api/export/memoria', (req, res) => {
  try {
    const stmt = db.prepare(
      `SELECT capitulo, unidad, SUM(cantidad) as cantidad, COUNT(*) as num_hallazgos
       FROM hallazgos WHERE estado = 'Afectado' AND capitulo IS NOT NULL
       GROUP BY capitulo, unidad
       ORDER BY capitulo`
    );
    const rows = stmt.all();

    let csv = '"Item/Capitulo","Unidad","Cantidad","# hallazgos"\n';
    rows.forEach(row => {
      const capitulo = (row.capitulo || '').replace(/"/g, '""');
      const unidad = (row.unidad || '').replace(/"/g, '""');
      const cantidad = (row.cantidad || 0).toFixed(2);
      const num = row.num_hallazgos || 0;
      csv += `"${capitulo}","${unidad}",${cantidad},${num}\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=memoria_cantidades_ccp.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Inicializar y arrancar servidor
initDb().then(() => {
  console.log('Base de datos inicializada');

  app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en puerto ${PORT}`);
    console.log(`http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Error inicializando BD:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  if (db) {
    db.close();
    console.log('Base de datos cerrada');
  }
  process.exit(0);
});
