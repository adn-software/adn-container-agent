import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger.service';

const execAsync = promisify(exec);

export class MariaDBService {
  /**
   * Descubre todos los contenedores MariaDB en el servidor
   */
  async discoverContainers() {
    try {
      logger.info('Starting MariaDB discovery');

      // 1. Obtener contenedores MariaDB
      const { stdout: containersOutput } = await execAsync(
        `docker ps --filter "ancestor=mariadb" --format "{{.ID}}|{{.Names}}|{{.Status}}"`
      );

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

      const mariadbContainers = [];

      // 2. Para cada contenedor, obtener información detallada
      for (const container of containers) {
        try {
          const containerInfo = await this.getContainerInfo(container);
          mariadbContainers.push(containerInfo);
        } catch (error) {
          logger.error(`Error processing container ${container.name}:`, error);
        }
      }

      return mariadbContainers;
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
    const versionMatch = versionOutput.match(/Ver (\d+\.\d+\.\d+)/);
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
