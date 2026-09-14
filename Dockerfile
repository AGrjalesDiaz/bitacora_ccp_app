FROM node:18-alpine

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production && npm install sqlite3

# Copiar resto de la app
COPY . .

# Crear carpeta de uploads
RUN mkdir -p uploads

# Exponer puerto
EXPOSE 3000

# Comando para iniciar
CMD ["npm", "start"]
