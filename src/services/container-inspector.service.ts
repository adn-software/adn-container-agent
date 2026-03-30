import { dockerService } from './docker.service';
import { fileService } from './file.service';
import { memoryService } from './memory.service';
import { logger } from './logger.service';
import { join } from 'path';

export class ContainerInspectorService {
  async listMariaDBContainers(): Promise<any[]> {
    try {
      const containers = await dockerService.listContainers();
      
      const enrichedContainers = await Promise.all(
        containers.map(async (container) => {
          try {
            const inspection = await dockerService.inspectContainer(container.Names);
            
            return {
              id: container.ID,
              name: container.Names.replace(/^\//, ''),
              image: container.Image,
              state: container.State,
              status: container.Status,
              ports: this.extractPorts(inspection),
              created: container.CreatedAt,
              labels: inspection.Config?.Labels || {},
              mounts: inspection.Mounts || [],
            };
          } catch (error) {
            logger.error(`Error inspecting container ${container.Names}:`, error);
            return null;
          }
        })
      );
      
      return enrichedContainers.filter(c => c !== null);
    } catch (error) {
      logger.error('Error listing containers:', error);
      throw error;
    }
  }

  async getContainerConfig(slug: string): Promise<any> {
    try {
      const containerDir = await fileService.getContainerDirectory(slug);
      const mycnfPath = join(containerDir, 'config', 'my.cnf');
      const envPath = join(containerDir, '.env');
      
      const exists = await fileService.fileExists(mycnfPath);
      if (!exists) {
        throw new Error(`Config file not found for container ${slug}`);
      }
      
      const mycnfContent = await fileService.readFile(mycnfPath);
      const innodbMemory = memoryService.extractInnodbMemory(mycnfContent);
      
      // Leer archivo .env para obtener memoria del contenedor
      let memoryLimit = '2.6g';
      try {
        const envExists = await fileService.fileExists(envPath);
        if (envExists) {
          const envContent = await fileService.readFile(envPath);
          const memMatch = envContent.match(/MEM_LIMIT=(.+)/);
          if (memMatch) {
            memoryLimit = memMatch[1].trim();
          }
        }
      } catch (error) {
        logger.warn(`Could not read .env file for ${slug}:`, error);
      }
      
      return {
        slug,
        mycnfContent,
        innodbBufferPoolSize: innodbMemory,
        memoryLimit,
      };
    } catch (error) {
      logger.error(`Error getting config for ${slug}:`, error);
      throw error;
    }
  }

  private extractPorts(inspection: any): number[] {
    const ports: number[] = [];
    
    if (inspection.NetworkSettings?.Ports) {
      for (const [containerPort, hostBindings] of Object.entries(inspection.NetworkSettings.Ports)) {
        if (Array.isArray(hostBindings)) {
          for (const binding of hostBindings) {
            if (binding.HostPort) {
              ports.push(parseInt(binding.HostPort, 10));
            }
          }
        }
      }
    }
    
    return ports;
  }

  extractSlugFromName(containerName: string): string {
    // Asume formato: mariadb-{slug}
    return containerName.replace(/^mariadb-/, '');
  }

  extractPortFromSlug(slug: string): number | null {
    // Asume formato: {puerto}-{nombre-cliente}
    const match = slug.match(/^(\d+)-/);
    return match ? parseInt(match[1], 10) : null;
  }

  async getContainerHealth(slug: string): Promise<any> {
    try {
      const containerName = `mariadb-${slug}`;
      
      // Verificar que el contenedor existe y está corriendo
      const exists = await dockerService.containerExists(containerName);
      if (!exists) {
        throw new Error('Container not found');
      }
      
      const isRunning = await dockerService.isContainerRunning(containerName);
      if (!isRunning) {
        throw new Error('Container is not running');
      }
      
      // Obtener información básica del contenedor
      const inspection = await dockerService.inspectContainer(containerName);
      
      // Ejecutar comandos de health check dentro del contenedor
      const healthData = await this.executeHealthChecks(containerName);
      
      return {
        slug,
        containerName,
        status: 'healthy',
        uptime: this.calculateUptime(inspection.State?.StartedAt),
        connections: healthData.connections,
        version: healthData.version,
        databases: healthData.databases,
        memory: {
          usage: healthData.memoryUsage,
          limit: healthData.memoryLimit,
        },
        disk: {
          usage: healthData.diskUsage,
          free: healthData.diskFree,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error(`Error getting health for ${slug}:`, error);
      throw error;
    }
  }

  private async executeHealthChecks(containerName: string): Promise<any> {
    try {
      // Ejecutar comandos MySQL para obtener métricas
      const commands = [
        { name: 'version', cmd: 'mysql -u root -p$MYSQL_ROOT_PASSWORD -e "SELECT VERSION();" --silent' },
        { name: 'connections', cmd: 'mysql -u root -p$MYSQL_ROOT_PASSWORD -e "SHOW STATUS LIKE \'Threads_connected\';" --silent' },
        { name: 'databases', cmd: 'mysql -u root -p$MYSQL_ROOT_PASSWORD -e "SHOW DATABASES;" --silent' },
      ];
      
      const results: any = {};
      
      for (const command of commands) {
        try {
          const output = await dockerService.executeCommand(`docker exec ${containerName} ${command.cmd}`);
          results[command.name] = this.parseCommandOutput(command.name, output.stdout);
        } catch (error) {
          logger.warn(`Health check command failed: ${command.name}`, error);
          results[command.name] = 'N/A';
        }
      }
      
      return {
        version: results.version || 'N/A',
        connections: results.connections || 'N/A',
        databases: results.databases || 'N/A',
        memoryUsage: 'N/A', // TODO: Implementar memory check
        memoryLimit: 'N/A',
        diskUsage: 'N/A',
        diskFree: 'N/A',
      };
    } catch (error) {
      logger.error('Error executing health checks:', error);
      return {
        version: 'N/A',
        connections: 'N/A',
        databases: 'N/A',
        memoryUsage: 'N/A',
        memoryLimit: 'N/A',
        diskUsage: 'N/A',
        diskFree: 'N/A',
      };
    }
  }

  private parseCommandOutput(commandName: string, output: string): string {
    switch (commandName) {
      case 'version':
        return output.trim().split('\n')[0] || 'N/A';
      case 'connections':
        const match = output.match(/Threads_connected\s+(\d+)/);
        return match ? match[1] : 'N/A';
      case 'databases':
        const lines = output.trim().split('\n');
        return lines.filter(line => line && line !== 'Database').join(', ') || 'N/A';
      default:
        return output.trim() || 'N/A';
    }
  }

  private calculateUptime(startTime?: string): string {
    if (!startTime) return 'N/A';
    
    const start = new Date(startTime);
    const now = new Date();
    const diff = now.getTime() - start.getTime();
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  extractClientNameFromSlug(slug: string): string {
    // Asume formato: {puerto}-{nombre-cliente}
    const parts = slug.split('-');
    return parts.slice(1).join('-');
  }
}

export const containerInspectorService = new ContainerInspectorService();
