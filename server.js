const express = require('express');
const sqlite3 = require('sqlite3').verbose();
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
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(path.join(__dirname, 'data.db'), (err) => {
      if (err) {
        console.error('Error abriendo BD:', err);
        reject(err);
      } else {
        console.log('Base de datos abierta');
        createTables().then(resolve).catch(reject);
      }
    });
  });
}

function createTables() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Tabla de configuración
      db.run(`CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT
      )`, (err) => {
        if (err) reject(err);
      });

      // Tabla de catálogo de elementos
      db.run(`CREATE TABLE IF NOT EXISTS catalogo (
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
      )`, (err) => {
        if (err) reject(err);
      });

      // Tabla de hallazgos ("la sábana")
      db.run(`CREATE TABLE IF NOT EXISTS hallazgos (
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
      )`, (err) => {
        if (err) reject(err);
      });

      // Tabla de índices para búsquedas rápidas
      db.run(`CREATE INDEX IF NOT EXISTS idx_hallazgos_espacio ON hallazgos(codigo_espacio)`, (err) => {
        if (err) reject(err);
      });

      db.run(`CREATE INDEX IF NOT EXISTS idx_hallazgos_estado ON hallazgos(estado)`, (err) => {
        if (err) reject(err);
      });

      db.run(`CREATE INDEX IF NOT EXISTS idx_hallazgos_capitulo ON hallazgos(capitulo)`, (err) => {
        if (err) reject(err);
      });

      // Insertar valores por defecto de configuración
      db.run(`INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)`,
        ['umbral_fisura_mm', '5'],
        (err) => {
          if (err) {
            console.error('Error insertando config default:', err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  });
}

// API Routes

// GET /api/config — obtener configuración
app.get('/api/config', (req, res) => {
  db.all(`SELECT * FROM config`, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      const config = {};
      rows.forEach(row => {
        config[row.key] = isNaN(row.value) ? row.value : parseFloat(row.value);
      });
      res.json(config);
    }
  });
});

// PUT /api/config/:key — actualizar configuración
app.put('/api/config/:key', (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  db.run(`INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)`, [key, String(value)], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ key, value });
    }
  });
});

// GET /api/catalogo — obtener catálogo de elementos
app.get('/api/catalogo', (req, res) => {
  db.all(`SELECT data FROM catalogo`, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      const catalogo = rows.map(row => JSON.parse(row.data));
      res.json(catalogo);
    }
  });
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

  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows || []);
    }
  });
});

// GET /api/hallazgos/:piso_real/:codigo_elemento — obtener hallazgo específico
app.get('/api/hallazgos/:piso_real/:codigo_elemento', (req, res) => {
  const { piso_real, codigo_elemento } = req.params;
  db.get(
    `SELECT * FROM hallazgos WHERE piso_real = ? AND codigo_elemento = ?`,
    [piso_real, codigo_elemento],
    (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (!row) {
        res.status(404).json({ error: 'Hallazgo no encontrado' });
      } else {
        if (row.fotos) {
          row.fotos = JSON.parse(row.fotos);
        }
        res.json(row);
      }
    }
  );
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

  db.run(
    `INSERT OR REPLACE INTO hallazgos
     (piso_real, codigo_elemento, codigo_espacio, oficina, tipo_elemento, estado,
      severidad_key, severidad_label, patologia, material, intervencion, capitulo,
      unidad, tipo_cantidad, cantidad, codigo_origen, espesor_mm, ml_grapado,
      observaciones, tecnico, fecha, fotos)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      piso_real, codigo_elemento, codigo_espacio, oficina, tipo_elemento, estado,
      severidad_key, severidad_label, patologia, material, intervencion, capitulo,
      unidad, tipo_cantidad, cantidad || null, codigo_origen || null, espesor_mm || null,
      ml_grapado || null, observaciones || null, tecnico || null, fecha, fotosJson
    ],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ piso_real, codigo_elemento, fecha });
      }
    }
  );
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
  db.all(
    `SELECT * FROM hallazgos ORDER BY codigo_espacio, codigo_elemento`,
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

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
    }
  );
});

// GET /api/export/memoria — exportar CSV de memoria de cantidades
app.get('/api/export/memoria', (req, res) => {
  db.all(
    `SELECT capitulo, unidad, SUM(cantidad) as cantidad, COUNT(*) as num_hallazgos
     FROM hallazgos WHERE estado = 'Afectado' AND capitulo IS NOT NULL
     GROUP BY capitulo, unidad
     ORDER BY capitulo`,
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

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
    }
  );
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
    db.close((err) => {
      if (err) console.error(err);
      console.log('Base de datos cerrada');
      process.exit(0);
    });
  }
});
