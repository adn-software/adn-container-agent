import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger.service';

const execAsync = promisify(exec);

interface CacheEntry {
  data: any;
  timestamp: number;
}

export class MariaDBService {
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL = parseInt(process.env.CACHE_TTL || '60000'); // 1 minuto por defecto
  private readonly DISCOVERY_TIMEOUT = parseInt(process.env.DISCOVERY_TIMEOUT || '30000'); // 30 segundos

  /**
   * Limpia el caché de descubrimiento
   */
  clearCache() {
    this.cache.clear();
    logger.info('Discovery cache cleared');
  }

  /**
   * Descubre todos los contenedores MariaDB en el servidor
   * Implementa caché y timeout configurables
   */
  async discoverContainers() {
    // Verificar caché
    const cacheKey = 'discovery';
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      logger.info('Returning cached discovery results');
      return cached.data;
    }

    try {
      logger.info('Starting MariaDB discovery');

      // Ejecutar discovery con timeout
      const discoveryPromise = this.performDiscovery();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Discovery timeout')), this.DISCOVERY_TIMEOUT)
      );

      const data = await Promise.race([discoveryPromise, timeoutPromise]) as any;

      // Guardar en caché
      this.cache.set(cacheKey, { data, timestamp: Date.now() });

      return data;
    } catch (error) {
      logger.error('Error discovering MariaDB containers:', error);
      throw error;
    }
  }

  /**
   * Realiza el descubrimiento real de contenedores
   */
  private async performDiscovery() {
    try {

      // 1. Obtener todos los contenedores y filtrar por imagen MariaDB
      const { stdout: allContainers } = await execAsync(
        `docker ps --format "{{.ID}}|{{.Names}}|{{.Status}}|{{.Image}}"`
      );

      const mariadbLines = allContainers
        .trim()
        .split('\n')
        .filter(line => line && line.toLowerCase().includes('mariadb'));

      const containersOutput = mariadbLines
        .map(line => {
          const parts = line.split('|');
          return `${parts[0]}|${parts[1]}|${parts[2]}`;
        })
        .join('\n');

      if (!containersOutput.trim()) {
        logger.info('No MariaDB containers found');
        return [];
      }

      const containers = containersOutput
        .trim()
        .split('\n')
        .filter(line => line)
        .map(line => {
          const [id, name, status] = line.split('|');
          return { id, name, status };
        });

      logger.info(`Found ${containers.length} MariaDB containers`);

      // 2. Procesar contenedores en paralelo
      const results = await Promise.all(
        containers.map(container =>
          this.getContainerInfo(container).catch(error => {
            logger.error(`Error processing container ${container.name}:`, error);
            return null;
          })
        )
      );

      // Filtrar resultados nulos (errores)
      return results.filter(Boolean);
    } catch (error) {
      logger.error('Error discovering MariaDB containers:', error);
      throw error;
    }
  }

  /**
   * Obtiene información detallada de un contenedor
   */
  private async getContainerInfo(container: any) {
    // Obtener versión de MariaDB
    const { stdout: versionOutput } = await execAsync(
      `docker exec ${container.id} mysql --version`
    );
    // Buscar versión en diferentes formatos: "Ver 10.11.6" o "10.11.6-MariaDB"
    const versionMatch = versionOutput.match(/(?:Ver\s+)?(\d+\.\d+\.\d+)/);
    const mariadbVersion = versionMatch ? versionMatch[1] : 'unknown';

    // Obtener puerto
    const { stdout: portOutput } = await execAsync(
      `docker port ${container.id} 3306 2>/dev/null || echo ""`
    );
    const port = portOutput.trim() ? parseInt(portOutput.split(':')[1]) : 3306;

    // Obtener password de root
    const { stdout: envOutput } = await execAsync(
      `docker inspect ${container.id} --format '{{range .Config.Env}}{{println .}}{{end}}'`
    );
    const rootPasswordMatch = envOutput.match(/MYSQL_ROOT_PASSWORD=(.+)/);
    const rootPassword = rootPasswordMatch ? rootPasswordMatch[1].trim() : '';

    // Obtener bases de datos
    const databases = await this.getDatabases(container.id, rootPassword);

    return {
      containerName: container.name,
      containerId: container.id,
      status: container.status.includes('Up') ? 'running' : 'stopped',
      mariadbVersion,
      host: 'localhost',
      port,
      rootPassword,
      databases,
    };
  }

  /**
   * Obtiene la lista de bases de datos de un contenedor
   */
  private async getDatabases(containerId: string, rootPassword: string) {
    try {
      const query = `
        SELECT 
          SCHEMA_NAME as databaseName,
          DEFAULT_CHARACTER_SET_NAME as charset,
          DEFAULT_COLLATION_NAME as collation,
          COALESCE(
            (SELECT SUM(data_length + index_length) 
             FROM information_schema.TABLES 
             WHERE table_schema = SCHEMA_NAME), 
            0
          ) as sizeBytes,
          (SELECT COUNT(*) 
           FROM information_schema.TABLES 
           WHERE table_schema = SCHEMA_NAME) as tableCount
        FROM information_schema.SCHEMATA
        WHERE SCHEMA_NAME NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
        ORDER BY SCHEMA_NAME;
      `;

      const { stdout } = await execAsync(
        `docker exec ${containerId} mysql -uroot -p${rootPassword} -e "${query}" --batch --skip-column-names 2>/dev/null`
      );

      if (!stdout.trim()) {
        return [];
      }

      const databases = stdout
        .trim()
        .split('\n')
        .filter(line => line)
        .map(line => {
          const [databaseName, charset, collation, sizeBytes, tableCount] =
            line.split('\t');
          return {
            databaseName,
            charset,
            collation,
            sizeBytes: parseInt(sizeBytes) || 0,
            tableCount: parseInt(tableCount) || 0,
            createdAt: new Date().toISOString(),
          };
        });

      return databases;
    } catch (error) {
      logger.error(`Error getting databases from container ${containerId}:`, error);
      return [];
    }
  }
}

export const mariadbService = new MariaDBService();
