const Database = require('better-sqlite3');
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
try {
  const db = new Database(dbPath);
  console.log('BD abierta');

  // Limpiar tabla de catálogo existente
  db.exec(`DELETE FROM catalogo`);
  console.log('Tabla de catálogo limpiada');

  // Insertar elementos
  const stmt = db.prepare(`
    INSERT INTO catalogo (id, tipo, oficina, secundaria, altura_fija, punto_fijo, muro_asociado, area_base_m2, profundidad_fija, tipo_buitron, ubicacion, data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insert = db.transaction((elementos) => {
    for (const el of elementos) {
      stmt.run(
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
      );
    }
  });

  insert(catalogo);
  console.log(`${catalogo.length} elementos insertados`);

  db.close();
  console.log('Seed completado');
  process.exit(0);
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
