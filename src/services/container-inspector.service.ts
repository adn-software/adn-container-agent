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
      
      const exists = await fileService.fileExists(mycnfPath);
      if (!exists) {
        throw new Error(`Config file not found for container ${slug}`);
      }
      
      const mycnfContent = await fileService.readFile(mycnfPath);
      const innodbMemory = memoryService.extractInnodbMemory(mycnfContent);
      
      return {
        slug,
        mycnfContent,
        innodbBufferPoolSize: innodbMemory,
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

  extractClientNameFromSlug(slug: string): string {
    // Asume formato: {puerto}-{nombre-cliente}
    const parts = slug.split('-');
    return parts.slice(1).join('-');
  }
}

export const containerInspectorService = new ContainerInspectorService();
