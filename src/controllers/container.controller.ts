import { Request, Response } from 'express';
import { dockerService } from '../services/docker.service';
import { fileService } from '../services/file.service';
import { memoryService } from '../services/memory.service';
import { containerInspectorService } from '../services/container-inspector.service';
import { logger } from '../services/logger.service';
import { config } from '../config/config';
import { join } from 'path';

export class ContainerController {
  async createContainer(req: Request, res: Response) {
    try {
      const {
        clientName,
        slug,
        port,
        mycnfContent,
        innodbBufferPoolSize,
        memoryLimit,
        mysqlRootPassword,
        mysqlDatabase = 'sistemasadn',
        mysqlUser = 'sistemas',
        mysqlPassword = 'adn',
      } = req.body;

      // Validar campos requeridos
      if (!clientName || !slug || !port || !mycnfContent || !innodbBufferPoolSize) {
        return res.status(400).json({
          error: 'Missing required fields',
          required: ['clientName', 'slug', 'port', 'mycnfContent', 'innodbBufferPoolSize'],
        });
      }

      logger.info(`Creating container for ${clientName} (${slug})`);

      // Calcular memoria del contenedor si no se proporciona
      const containerMemory = memoryLimit || memoryService.calculateContainerMemory(innodbBufferPoolSize);

      // Crear directorio del contenedor
      const containerDir = await fileService.getContainerDirectory(slug);
      const containerExists = await fileService.fileExists(containerDir);

      if (containerExists) {
        return res.status(409).json({
          error: 'Container directory already exists',
          slug,
        });
      }

      await fileService.createDirectory(containerDir);

      // Copiar plantilla
      logger.info(`Copying template to ${containerDir}`);
      await fileService.copyDirectory(config.templatePath, containerDir);

      // Crear archivo my.cnf
      logger.info('Creating my.cnf file');
      await fileService.createMyCnfFile(containerDir, mycnfContent);

      // Crear archivo .env
      logger.info('Creating .env file');
      const containerName = `mariadb-${slug}`;
      const volumeName = `mariadb_${slug.replace(/-/g, '_')}_data`;
      const networkName = `mariadb_${slug.replace(/-/g, '_')}_network`;

      await fileService.createEnvFile(containerDir, {
        CONTAINER_NAME: containerName,
        VOLUME_NAME: volumeName,
        NETWORK_NAME: networkName,
        MYSQL_ROOT_PASSWORD: mysqlRootPassword,
        MYSQL_DATABASE: mysqlDatabase,
        MYSQL_USER: mysqlUser,
        MYSQL_PASSWORD: mysqlPassword,
        MYSQL_PORT: port.toString(),
        TIMEZONE: 'America/Caracas',
        MEM_LIMIT: containerMemory,
      });

      // Iniciar contenedor con docker compose
      logger.info('Starting container with docker compose');
      await dockerService.composeUp(containerDir);

      // Esperar un momento para que el contenedor inicie
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Verificar estado del contenedor
      const isRunning = await dockerService.isContainerRunning(containerName);

      res.status(201).json({
        success: true,
        container: {
          clientName,
          slug,
          port,
          containerName,
          volumeName,
          networkName,
          innodbBufferPoolSize,
          memoryLimit: containerMemory,
          status: isRunning ? 'running' : 'created',
        },
      });
    } catch (error: any) {
      logger.error('Error creating container:', error);
      res.status(500).json({
        error: 'Failed to create container',
        message: error.message,
      });
    }
  }

  async listContainers(req: Request, res: Response) {
    try {
      const containers = await containerInspectorService.listMariaDBContainers();
      res.json({ containers });
    } catch (error: any) {
      logger.error('Error listing containers:', error);
      res.status(500).json({
        error: 'Failed to list containers',
        message: error.message,
      });
    }
  }

  async getContainerStatus(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      const containerName = `mariadb-${slug}`;

      const exists = await dockerService.containerExists(containerName);
      if (!exists) {
        return res.status(404).json({ error: 'Container not found' });
      }

      const isRunning = await dockerService.isContainerRunning(containerName);
      const inspection = await dockerService.inspectContainer(containerName);

      res.json({
        slug,
        containerName,
        status: isRunning ? 'running' : 'stopped',
        state: inspection.State,
        created: inspection.Created,
      });
    } catch (error: any) {
      logger.error('Error getting container status:', error);
      res.status(500).json({
        error: 'Failed to get container status',
        message: error.message,
      });
    }
  }

  async getContainerConfig(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      const config = await containerInspectorService.getContainerConfig(slug);
      res.json(config);
    } catch (error: any) {
      logger.error('Error getting container config:', error);
      res.status(500).json({
        error: 'Failed to get container config',
        message: error.message,
      });
    }
  }

  async healthCheck(req: Request, res: Response) {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    });
  }

  async ping(req: Request, res: Response) {
    res.json({ pong: true });
  }
}

export const containerController = new ContainerController();
