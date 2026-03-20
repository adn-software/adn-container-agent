# ADN Container Agent

Agente dockerizado para gestión remota de contenedores MariaDB.

## Instalación

### 1. Configurar variables de entorno

```bash
cp .env.example .env
nano .env
```

Configurar:
- `AGENT_API_KEY`: Generar una clave segura
- `DOCKER_DATA_PATH`: Ruta donde se almacenarán los datos de los contenedores
- `TEMPLATE_PATH`: Ruta a la plantilla base de MariaDB

### 2. Construir y levantar el contenedor

```bash
docker-compose up -d --build
```

### 3. Verificar estado

```bash
docker logs adn-container-agent
curl http://localhost:3100/api/health
```

## Endpoints

### Públicos
- `GET /api/health` - Health check

### Protegidos (requieren API Key en header `Authorization: Bearer <key>`)
- `POST /api/containers/create` - Crear contenedor MariaDB
- `GET /api/containers/list` - Listar contenedores MariaDB
- `GET /api/containers/:slug/status` - Estado de contenedor
- `GET /api/containers/:slug/config` - Configuración my.cnf
- `GET /api/ping` - Ping

## Desarrollo local

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm start
```
