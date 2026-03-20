# Instalación del Agente Dockerizado

Guía paso a paso para instalar el agente en un servidor Docker remoto.

## Requisitos Previos

- Servidor Linux con Docker instalado
- Docker Compose instalado
- Acceso SSH al servidor
- Puertos disponibles: 3100 (agente)

## Paso 1: Preparar el Servidor

```bash
# Conectarse al servidor
ssh user@server-ip

# Crear directorios necesarios
sudo mkdir -p /var/docker-data/mariadb
sudo mkdir -p /home/adn/mariadb-client

# Dar permisos
sudo chown -R $USER:$USER /var/docker-data/mariadb
sudo chown -R $USER:$USER /home/adn/mariadb-client
```

## Paso 2: Crear Plantilla Base

Crear la estructura de plantilla en `/home/adn/mariadb-client/`:

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  mariadb:
    image: mariadb:10.5
    container_name: ${CONTAINER_NAME}
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: ${MYSQL_DATABASE}
      MYSQL_USER: ${MYSQL_USER}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD}
      TZ: ${TIMEZONE}
    ports:
      - "${MYSQL_PORT}:3306"
    volumes:
      - ${VOLUME_NAME}:/var/lib/mysql
      - ./config/my.cnf:/etc/mysql/conf.d/my.cnf:ro
    networks:
      - ${NETWORK_NAME}
    deploy:
      resources:
        limits:
          memory: ${MEM_LIMIT}

volumes:
  ${VOLUME_NAME}:
    name: ${VOLUME_NAME}

networks:
  ${NETWORK_NAME}:
    name: ${NETWORK_NAME}
    driver: bridge
```

**config/my.cnf:**
```ini
[mysqld]
# InnoDB Settings
innodb_buffer_pool_size = 2G
innodb_log_file_size = 512M
innodb_flush_log_at_trx_commit = 2
innodb_flush_method = O_DIRECT

# General Settings
max_connections = 200
table_open_cache = 4000
query_cache_size = 0
query_cache_type = 0

# Character Set
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
```

## Paso 3: Clonar e instalar el Agente usando Docker

```bash
# Clonar repositorio
cd ~
git clone <repository-url> adn-container-agent
cd adn-container-agent

# Construir la imagen (usa el Dockerfile para instalar dependencias y compilar)
docker compose build
```

**Nota:** El repositorio solo contiene el código fuente; el build dentro del contenedor genera `node_modules` y `dist`, por lo que no necesitas tener `npm`/Node instalados en el servidor.

## Paso 4: Configurar Variables de Entorno

```bash
# Copiar archivo de ejemplo
cp .env.example .env

# Editar configuración
nano .env
```

Configurar las siguientes variables:

```env
# Puerto del agente
AGENT_PORT=3100

# API Key (generar una clave segura)
AGENT_API_KEY=tu-clave-super-segura-de-minimo-32-caracteres

# Rutas
DOCKER_DATA_PATH=/var/docker-data/mariadb
TEMPLATE_PATH=/home/adn/mariadb-client

# Log level
LOG_LEVEL=info
```

**Generar API Key segura:**
```bash
# Opción 1: OpenSSL
openssl rand -base64 32

# Opción 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Paso 5: Construir y Levantar el Agente

```bash
# Construir imagen
docker-compose build

# Levantar servicio
docker-compose up -d

# Verificar estado
docker-compose ps
docker logs adn-container-agent
```

## Paso 6: Verificar Instalación

```bash
# Health check
curl http://localhost:3100/api/health

# Debería retornar:
# {"status":"healthy","timestamp":"...","version":"1.0.0"}

# Ping (requiere API Key)
curl -H "Authorization: Bearer tu-api-key" http://localhost:3100/api/ping

# Debería retornar:
# {"pong":true}
```

## Paso 7: Configurar Firewall (Opcional)

Si usas firewall, permitir el puerto del agente:

```bash
# UFW
sudo ufw allow 3100/tcp

# Firewalld
sudo firewall-cmd --permanent --add-port=3100/tcp
sudo firewall-cmd --reload
```

## Paso 8: Registrar en el Sistema Central

1. Ir a la interfaz web del sistema
2. Navegar a `/servers`
3. Click en "Add Server"
4. Completar formulario:
   - **Name**: Nombre descriptivo del servidor
   - **Type**: docker
   - **IP Address**: IP pública del servidor
   - **Agent Port**: 3100
   - **Agent API Key**: La clave configurada en el .env
   - **Docker Data Path**: /var/docker-data/mariadb
   - **Template Path**: /home/adn/mariadb-client
5. Guardar

## Paso 9: Probar Conexión

Desde la interfaz web:

1. Ir a la lista de servidores
2. Click en "Ping" en el servidor recién agregado
3. Debería mostrar latencia en ms

## Mantenimiento

### Ver logs del agente

```bash
docker logs adn-container-agent

# Seguir logs en tiempo real
docker logs -f adn-container-agent

# Ver últimas 100 líneas
docker logs --tail 100 adn-container-agent
```

### Reiniciar agente

```bash
docker-compose restart

# O forzar recreación
docker-compose down
docker-compose up -d
```

### Actualizar agente

```bash
# Detener servicio
docker-compose down

# Actualizar código
git pull

# Instalar nuevas dependencias (si las hay)
npm install

# Recompilar TypeScript
npm run build

# Reconstruir y levantar
docker-compose up -d --build
```

### Backup de configuración

```bash
# Backup de .env
cp .env .env.backup

# Backup de plantilla
tar -czf mariadb-template-backup.tar.gz /home/adn/mariadb-client
```

## Troubleshooting

### El agente no inicia

```bash
# Ver logs detallados
docker-compose logs

# Verificar permisos de Docker socket
ls -l /var/run/docker.sock

# Verificar que el puerto esté disponible
sudo netstat -tulpn | grep 3100
```

### Error de permisos en Docker

```bash
# Agregar usuario al grupo docker
sudo usermod -aG docker $USER

# Cerrar sesión y volver a entrar
exit
ssh user@server-ip
```

### No puede crear contenedores

```bash
# Verificar que Docker funciona
docker ps

# Verificar espacio en disco
df -h

# Verificar permisos en directorios
ls -la /var/docker-data/mariadb
ls -la /home/adn/mariadb-client
```

### Ping falla desde el sistema central

1. Verificar que el agente esté corriendo: `docker ps`
2. Verificar firewall: `sudo ufw status`
3. Verificar que el puerto esté escuchando: `netstat -tulpn | grep 3100`
4. Verificar API Key en ambos lados
5. Probar desde el servidor: `curl http://localhost:3100/api/health`

## Desinstalación

```bash
# Detener y eliminar contenedor
docker-compose down

# Eliminar volúmenes (CUIDADO: esto elimina datos)
docker-compose down -v

# Eliminar código
cd ~
rm -rf adn-container-agent

# Eliminar directorios de datos (opcional)
sudo rm -rf /var/docker-data/mariadb
sudo rm -rf /home/adn/mariadb-client
```

## Seguridad

### Recomendaciones

1. **API Key**: Usar claves de mínimo 32 caracteres
2. **Firewall**: Restringir acceso al puerto 3100 solo desde IPs conocidas
3. **HTTPS**: Considerar usar un reverse proxy con SSL (nginx/traefik)
4. **Actualizaciones**: Mantener Docker y el agente actualizados
5. **Logs**: Rotar logs regularmente para evitar llenar disco

### Configurar acceso restringido con UFW

```bash
# Permitir solo desde IP específica
sudo ufw allow from <ip-sistema-central> to any port 3100

# Denegar todo lo demás
sudo ufw default deny incoming
sudo ufw enable
```

## Soporte

Para problemas o consultas:
- Revisar logs del agente
- Revisar logs del sistema central
- Contactar al equipo de desarrollo
