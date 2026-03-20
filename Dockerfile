FROM node:20-alpine

WORKDIR /app

# Instalar Docker CLI y Docker Compose para ejecutar comandos docker
RUN apk add --no-cache docker-cli docker-cli-compose

# Copiar archivos de dependencias
COPY package*.json ./
COPY tsconfig.json ./

# Instalar dependencias (incluye devDependencies para compilar)
RUN npm install

# Copiar código fuente
COPY src ./src

# Compilar TypeScript
RUN npm run build

# Exponer puerto
EXPOSE 3100

# Comando de inicio
CMD ["node", "dist/index.js"]
