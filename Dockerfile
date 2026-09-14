FROM node:18-alpine

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install --omit=dev

# Copiar resto de la app
COPY . .

# Crear carpeta de uploads
RUN mkdir -p uploads

# Exponer puerto
EXPOSE 3000

# Comando para iniciar
CMD ["npm", "start"]
