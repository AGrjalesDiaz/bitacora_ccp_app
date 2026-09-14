# Guía de despliegue — Bitácora CCP

La app está lista para desplegarse en **Render** (recomendado), Railway o Fly.io con disco persistente.

## Requisitos previos

- Cuenta en [Render.com](https://render.com)
- Código disponible en GitHub (o cualquier repositorio Git que Render pueda acceder)
- Optualmente: dominio propio (se configura después de desplegar)

## Opción 1: Despliegue en Render (recomendado)

### Paso 1: Subir código a GitHub

```bash
git add .
git commit -m "Initial commit: Bitácora CCP app"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/bitacora_ccp_app.git
git push -u origin main
```

### Paso 2: Crear nuevo servicio en Render

1. Accede a [Render Dashboard](https://dashboard.render.com)
2. Click en **New +** → **Web Service**
3. Conecta tu repositorio de GitHub (autoriza a Render si es primera vez)
4. Selecciona el repositorio `bitacora_ccp_app`

### Paso 3: Configurar el servicio

**Nombre del servicio:** `bitacora-ccp-app` (o el que prefieras)

**Environment:** Node

**Build Command:** 
```
npm ci && npm run seed
```

**Start Command:**
```
npm start
```

**Plan:** Standard ($7/mes) o superior — IMPORTANTE: necesita disco persistente

### Paso 4: Agregar disco persistente

1. En la sección de configuración del servicio, desplega **Disks**
2. Click en **Add Disk**
   - **Nombre:** `app-storage`
   - **Path:** `/app/uploads` (aquí van las fotos comprimidas y la base de datos)
   - **Size:** 10 GB (suficiente para miles de fotos comprimidas)

### Paso 5: Configurar variables de entorno (opcional)

Si necesitas, puedes agregar:
- `NODE_ENV` = `production`
- `PORT` = `3000` (Render lo detecta automáticamente)

No necesitas configurar nada de base de datos — SQLite se crea automáticamente en `/app/data.db` (dentro del volumen persistente).

### Paso 6: Deploy

Click en **Create Web Service**. Render comenzará a construir e iniciar la app:
- Instala dependencias
- Ejecuta `npm run seed` para cargar el catálogo de elementos
- Inicia el servidor

Esto toma ~2 minutos. Verás logs en tiempo real en el dashboard.

### Paso 7: Verificar que funciona

Una vez deployada, Render te dará una URL como:
```
https://bitacora-ccp-app.onrender.com
```

Accede desde el celular, tablet o computadora. Deberías ver la app funcionando.

## Opción 2: Despliegue en Railway

1. Accede a [Railway.app](https://railway.app)
2. Click en **New Project** → **Deploy from GitHub**
3. Conecta tu repositorio
4. Railway auto-detectará `package.json` y `Dockerfile`
5. Agrega una variable de entorno: `PORT=3000`
6. **Importante:** Añade un **PostgreSQL Service** O usa el volumen persistente de Railway para SQLite

```bash
# En la carpeta del proyecto, crear volumen persistente
# Esto lo manejas desde el dashboard de Railway
```

Instrucciones detalladas en [Railway Docs](https://docs.railway.app)

## Opción 3: Despliegue en Fly.io

```bash
# Instalar CLI de Fly.io
# Ver: https://fly.io/docs/hands-on/install-flyctl/

flyctl auth login
flyctl launch
# Sigue los prompts, selecciona región cercana a ti (para menor latencia)
```

Fly.io también necesita volumen persistente configurado en `fly.toml`:

```toml
[mounts]
  source = "app_storage"
  destination = "/app/uploads"
```

Crear volumen:
```bash
flyctl volumes create app_storage --size 10 --region [tu_region]
```

Luego:
```bash
flyctl deploy
```

## Después del despliegue

### Conectar un dominio propio (opcional)

1. Compra un dominio (GoDaddy, Namecheap, etc.)
2. En el dashboard de tu plataforma (Render/Railway/Fly), busca **Custom Domains**
3. Añade tu dominio
4. Sigue las instrucciones para apuntar el DNS del dominio a la app
5. Espera 15-30 minutos a que se propague el DNS

**Ejemplo con Render:**
- Render te da un CNAME como `bitacora-ccp-app.onrender.com`
- En tu proveedor de dominio, crea un registro CNAME: `www` → `bitacora-ccp-app.onrender.com`
- También configura el root domain en Render

### Acceso 24/7

Una vez deployado, la app estará disponible en internet 24/7. Cualquier técnico puede abrirla desde el celular en la obra, sin necesidad de VPN ni de que nadie tenga la computadora prendida.

### Backups y mantenimiento

**Render:** Haz backup manual de la BD descargando `data.db` desde el panel de Render (Storage → Download)

**Railway/Fly:** Sus dashboards incluyen opciones de backup.

Para automatizar backups, puedes crear un script que periódicamente descargue la BD.

## Troubleshooting

### "Permiso denegado en /app/uploads"
- Asegúrate de que el disco está montado correctamente en `/app/uploads`
- Verifica que el build command incluye `mkdir -p uploads`

### "Base de datos corrupta"
- Si la BD se daña (redeploy interrumpido), simplemente bórrala:
  ```
  rm /app/data.db
  ```
  Se recreará automáticamente en el siguiente reinicio, pero perderás los datos.
  - Por eso es importante hacer **backups periódicos** descargando `data.db`

### La app está lenta
- Verifica que el plan de Render/Railway/Fly sea suficiente (Standard es mínimo)
- Si hay muchos datos, considera agregar un índice en la BD (ver `server.js`)

### "Fotos no se guardan"
- Verifica que el volumen persistente está montado en `/app/uploads`
- Comprueba que la app tiene permisos de escritura
- Revisa los logs en el dashboard de tu plataforma

## Cambios posteriores (redeploy)

Cuando hagas cambios en el código:

```bash
git add .
git commit -m "Fix: descripción del cambio"
git push origin main
```

Render/Railway/Fly auto-detectarán el push y redeployarán automáticamente.

**Importante:** El volumen persistente (`/app/uploads`, `/app/data.db`) **no se borra** entre redeploys, así que tus datos se mantienen intactos.

## Costo estimado

- **Render Standard:** ~$7/mes (incluye CPU, memoria, 10GB disco)
- **Railway:** Variable, típicamente $5-15/mes con volumen persistente
- **Fly.io:** Variable, desde $3/mes con volumen (muy económico si usas poco)

El costo exacto depende del tráfico y el tamaño de fotos. Comienza con Standard y ajusta después de ver el uso real.

---

**¿Preguntas?** Revisa los logs en el dashboard de tu plataforma — siempre dan pistas sobre qué falla.
