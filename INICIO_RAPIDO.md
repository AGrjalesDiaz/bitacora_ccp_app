# Inicio Rápido — Bitácora CCP

## Arrancar la app en local (desarrollo)

### Opción A: Windows (PowerShell o CMD)

```powershell
cd "G:\Mi unidad\Presupuestos técnicos viviendas afectadas terremoto\Camara de Comercio\bitacora_ccp_app"

# Primera vez: instalar dependencias (toma 3-5 minutos, sqlite3 se compila)
npm install

# Cargar catálogo en la BD
npm run seed

# Iniciar servidor
npm start

# Abre en navegador: http://localhost:3000
```

### Opción B: Mac/Linux

```bash
cd /ruta/a/bitacora_ccp_app
npm install
npm run seed
npm start
# Abre en navegador: http://localhost:3000
```

## Primer uso

1. **Abre:** http://localhost:3000
2. **Pon tu nombre:** Esquina superior derecha, campo "Técnico"
3. **Selecciona:** Piso (15 o 16) y Oficina (OF501-OF506, etc.)
4. **Captura:** Haz clic en "Capturar" en cualquier elemento
5. **Guarda:** Completa el formulario y haz clic en "Guardar"
6. **Exporta:** Ve a "Sábana" o "Memoria de cantidades" para descargar CSV

## Troubleshooting local

### "npm command not found"
- Instala Node.js desde [nodejs.org](https://nodejs.org) (v18 o superior)
- Reinicia PowerShell/CMD después de instalar

### "npm install se queda pegado"
- Presiona Ctrl+C y ejecuta: `npm install --force`
- Alternativamente: `npm install --legacy-peer-deps`

### "sqlite3: error de compilación"
- En Windows: Necesita Visual Studio Build Tools. Descárgalos de [aquí](https://visualstudio.microsoft.com/downloads/)
- Luego intenta `npm install` de nuevo

### "Address already in use :::3000"
- El puerto 3000 ya está en uso. Cierra la otra app o usa: `PORT=3001 npm start`

### "Cannot find module 'express'"
- Probablemente `npm install` no terminó correctamente
- Ejecuta: `npm install` de nuevo
- Si persiste, borra `node_modules` y `package-lock.json`, luego `npm install`

```powershell
rm -r node_modules
rm package-lock.json
npm install
```

### La BD se daña / Quiero empezar de cero
```bash
rm data.db
npm run seed
npm start
```

## Parar el servidor

Presiona **Ctrl+C** en la terminal.

## Siguiente: Desplegar a internet

Ver [DESPLIEGUE.md](DESPLIEGUE.md) para publicar en Render/Railway/Fly.io.

---

**Duración estimada:** 5 minutos (después de instalar Node.js)
