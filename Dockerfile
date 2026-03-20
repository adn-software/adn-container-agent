FROM node:20-alpine

WORKDIR /app

# Instalar Docker CLI para ejecutar comandos docker
RUN apk add --no-cache docker-cli

# Copiar archivos de dependencias
COPY package*.json ./
COPY tsconfig.json ./

# Instalar dependencias
RUN npm ci --production

# Copiar código fuente
COPY src ./src

# Compilar TypeScript
RUN npm run build

# Exponer puerto
EXPOSE 3100

# Comando de inicio
CMD ["node", "dist/index.js"]
