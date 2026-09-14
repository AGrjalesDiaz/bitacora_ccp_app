const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const catalogoFile = path.join(__dirname, '../data/catalogo_planta_tipo2.json');
const dbPath = path.join(__dirname, '../data.db');

// Leer catálogo
let catalogo;
try {
  const data = fs.readFileSync(catalogoFile, 'utf-8');
  catalogo = JSON.parse(data);
  console.log(`Catálogo leído: ${catalogo.length} elementos`);
} catch (err) {
  console.error('Error leyendo catálogo:', err);
  process.exit(1);
}

// Abrir BD
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error abriendo BD:', err);
    process.exit(1);
  }

  console.log('BD abierta');

  // Limpiar tabla de catálogo existente
  db.run(`DELETE FROM catalogo`, (err) => {
    if (err) {
      console.error('Error limpiando catálogo:', err);
      process.exit(1);
    }

    console.log('Tabla de catálogo limpiada');

    // Insertar elementos
    const stmt = db.prepare(`
      INSERT INTO catalogo (id, tipo, oficina, secundaria, altura_fija, punto_fijo, muro_asociado, area_base_m2, profundidad_fija, tipo_buitron, ubicacion, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let inserted = 0;
    catalogo.forEach((el) => {
      stmt.run(
        [
          el.id,
          el.tipo,
          el.oficina,
          el.secundaria || null,
          el.altura_fija || null,
          el.punto_fijo ? 1 : 0,
          el.muro_asociado || null,
          el.area_base_m2 || null,
          el.profundidad_fija || null,
          el.tipo_buitron || null,
          el.ubicacion || null,
          JSON.stringify(el)
        ],
        (err) => {
          if (err) console.error('Error insertando', el.id, ':', err);
          else inserted++;
        }
      );
    });

    stmt.finalize((err) => {
      if (err) {
        console.error('Error finalizando stmt:', err);
        process.exit(1);
      }

      console.log(`${inserted} elementos insertados`);

      db.close((err) => {
        if (err) console.error('Error cerrando BD:', err);
        console.log('Seed completado');
        process.exit(0);
      });
    });
  });
});
