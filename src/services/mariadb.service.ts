import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger.service';
import { executeWithRetry } from '../utils/retry.util';
import { validateContainerData, validateMariaDBContainerInfo } from '../utils/validation.util';

const execAsync = promisify(exec);

interface CacheEntry {
  data: any;
  timestamp: number;
}

export class MariaDBService {
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL = parseInt(process.env.CACHE_TTL || '60000'); // 1 minuto por defecto
  private readonly DISCOVERY_TIMEOUT = parseInt(process.env.DISCOVERY_TIMEOUT || '120000'); // 2 minutos para 48+ contenedores
  private readonly CONCURRENCY_LIMIT = parseInt(process.env.DISCOVERY_CONCURRENCY || '2'); // Procesar 5 contenedores en paralelo

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
      logger.info('Starting MariaDB discovery', {
        timestamp: new Date().toISOString(),
        serverId: process.env.SERVER_ID || 'unknown',
        cacheTTL: this.CACHE_TTL,
        timeout: this.DISCOVERY_TIMEOUT,
      });

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
      logger.error('Error discovering MariaDB containers', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });
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
          const container = { id, name, status };
          
          // Validar datos del contenedor
          try {
            validateContainerData(container);
          } catch (error) {
            logger.warn('Invalid container data, skipping', {
              containerId: id,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
            return null;
          }
          
          return container;
        })
        .filter(Boolean) as any[];

      logger.info(`Found ${containers.length} valid MariaDB containers, processing with concurrency limit ${this.CONCURRENCY_LIMIT}`);

      // 2. Procesar contenedores en lotes para limitar concurrencia
      const results: any[] = [];
      for (let i = 0; i < containers.length; i += this.CONCURRENCY_LIMIT) {
        const batch = containers.slice(i, i + this.CONCURRENCY_LIMIT);
        logger.info(`Processing batch ${Math.floor(i / this.CONCURRENCY_LIMIT) + 1}/${Math.ceil(containers.length / this.CONCURRENCY_LIMIT)} (${batch.length} containers)`);

        const batchResults = await Promise.all(
          batch.map(container =>
            this.getContainerInfo(container).catch(error => {
              logger.error(`Error processing container ${container.name}:`, error);
              return null;
            })
          )
        );

        results.push(...batchResults.filter(Boolean));

        // Log de progreso cada 10 contenedores
        if (i + this.CONCURRENCY_LIMIT < containers.length) {
          logger.info(`Progress: ${results.length}/${containers.length} containers processed`);
        }
      }

      logger.info(`Discovery completed: ${results.length}/${containers.length} containers successfully processed`);
      return results;
    } catch (error) {
      logger.error('Error discovering MariaDB containers:', error);
      throw error;
    }
  }

  /**
   * Ejecuta una promesa con timeout
   */
  private async executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout: ${operation} exceeded ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * Obtiene información detallada de un contenedor con retry y timeout
   */
  private async getContainerInfo(container: any) {
    const CONTAINER_TIMEOUT = 45000; // 45 segundos máximo por contenedor (para contenedores con muchas BDs)

    logger.debug('Getting container info', {
      containerId: container.id,
      containerName: container.name,
    });

    try {
      // Obtener versión de MariaDB con retry y timeout
      const { stdout: versionOutput } = await this.executeWithTimeout(
        executeWithRetry(
          () => execAsync(`docker exec ${container.id} mysql --version`),
          { maxRetries: 2, initialDelay: 500, operationName: `Get version for ${container.name}` }
        ),
        CONTAINER_TIMEOUT,
        `Get version for ${container.name}`
      );
      const versionMatch = versionOutput.match(/(?:Ver\s+)?(\d+\.\d+\.\d+)/);
      const mariadbVersion = versionMatch ? versionMatch[1] : 'unknown';

      // Obtener puerto con timeout
      const { stdout: portOutput } = await this.executeWithTimeout(
        execAsync(`docker port ${container.id} 3306 2>/dev/null || echo ""`),
        5000,
        `Get port for ${container.name}`
      );
      const port = portOutput.trim() ? parseInt(portOutput.split(':')[1]) : 3306;

      // Obtener password de root con timeout
      const { stdout: envOutput } = await this.executeWithTimeout(
        execAsync(`docker inspect ${container.id} --format '{{range .Config.Env}}{{println .}}{{end}}'`),
        5000,
        `Get password for ${container.name}`
      );
      const rootPasswordMatch = envOutput.match(/MYSQL_ROOT_PASSWORD=(.+)/);
      const rootPassword = rootPasswordMatch ? rootPasswordMatch[1].trim() : '';

      // Obtener bases de datos con timeout (40s para contenedores con muchas BDs)
      const databases = await this.executeWithTimeout(
        this.getDatabases(container.id, rootPassword),
        40000,
        `Get databases for ${container.name}`
      );

      const containerInfo = {
        containerName: container.name,
        containerId: container.id,
        status: container.status.includes('Up') ? 'running' : 'stopped',
        mariadbVersion,
        host: 'localhost',
        port,
        rootPassword,
        databases,
      };

      // Validar información del contenedor
      validateMariaDBContainerInfo(containerInfo);

      logger.debug('Container info retrieved successfully', {
        containerId: container.id,
        databaseCount: databases.length,
      });

      return containerInfo;
    } catch (error) {
      logger.error('Failed to get container info', {
        containerId: container.id,
        containerName: container.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
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
      logger.error('Error getting databases from container', {
        containerId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      return [];
    }
  }
}

export const mariadbService = new MariaDBService();
