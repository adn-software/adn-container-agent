import { Request, Response } from 'express';
import { dockerService } from '../services/docker.service';
import { fileService } from '../services/file.service';
import { memoryService } from '../services/memory.service';
import { containerInspectorService } from '../services/container-inspector.service';
import { mycnfValidatorService } from '../services/mycnf-validator.service';
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
        logger.warn(`Container directory already exists: ${containerDir}`);
        
        // Verificar si el contenedor Docker también existe
        const containerName = `mariadb-${slug}`;
        const dockerExists = await dockerService.containerExists(containerName);
        
        return res.status(409).json({
          error: 'Container directory already exists',
          slug,
          directory: containerDir,
          dockerContainerExists: dockerExists,
          suggestion: dockerExists 
            ? 'Container is already running. Use a different slug or delete the existing container first.'
            : 'Directory exists but container is not running. You may need to manually clean up the directory.',
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

  async getContainerHealth(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      const health = await containerInspectorService.getContainerHealth(slug);
      res.json(health);
    } catch (error: any) {
      logger.error('Error getting container health:', error);
      res.status(500).json({
        error: 'Failed to get container health',
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

  async pingContainer(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      const containerName = `mariadb-${slug}`;

      // Verificar si el contenedor existe
      const exists = await dockerService.containerExists(containerName);
      if (!exists) {
        return res.status(404).json({ 
          success: false,
          error: 'Container not found',
          slug,
          containerName
        });
      }

      // Verificar si está corriendo
      const isRunning = await dockerService.isContainerRunning(containerName);
      
      // Obtener información del contenedor
      const inspection = await dockerService.inspectContainer(containerName);
      
      // Extraer puerto del slug
      const port = containerInspectorService.extractPortFromSlug(slug);
      
      // Intentar ping al puerto si está disponible
      let portAccessible = false;
      if (port && isRunning) {
        try {
          const net = require('net');
          portAccessible = await new Promise<boolean>((resolve) => {
            const socket = new net.Socket();
            const timeout = setTimeout(() => {
              socket.destroy();
              resolve(false);
            }, 3000);

            socket.connect(port, 'localhost', () => {
              clearTimeout(timeout);
              socket.destroy();
              resolve(true);
            });

            socket.on('error', () => {
              clearTimeout(timeout);
              resolve(false);
            });
          });
        } catch (error) {
          logger.warn(`Error pinging port ${port}:`, error);
        }
      }

      res.json({
        success: true,
        slug,
        containerName,
        status: isRunning ? 'running' : 'stopped',
        port,
        portAccessible,
        state: inspection.State,
        uptime: inspection.State?.StartedAt,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('Error pinging container:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to ping container',
        message: error.message,
      });
    }
  }

  async updateContainer(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      const { memoryLimit, mycnfContent } = req.body;

      logger.info(`Updating container ${slug}`, {
        hasMemoryLimit: !!memoryLimit,
        hasMycnfContent: !!mycnfContent,
        memoryLimit,
        mycnfContentLength: mycnfContent?.length,
      });

      if (!slug || !memoryLimit || !mycnfContent) {
        logger.error('Missing required fields', {
          slug: !!slug,
          memoryLimit: !!memoryLimit,
          mycnfContent: !!mycnfContent,
        });
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: slug, memoryLimit, mycnfContent',
          received: {
            slug: !!slug,
            memoryLimit: !!memoryLimit,
            mycnfContent: !!mycnfContent,
          },
        });
      }

      // 1. Validar my.cnf y extraer innodb_buffer_pool_size
      const validation = mycnfValidatorService.validateMyCnf(mycnfContent);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: 'Invalid my.cnf configuration',
          validationErrors: validation.errors,
        });
      }

      const innodbBufferPoolSize = mycnfValidatorService.extractInnodbBufferPoolSize(mycnfContent);
      logger.info(`Extracted innodb_buffer_pool_size: ${innodbBufferPoolSize}`);

      const containerDir = await fileService.getContainerDirectory(slug);
      const envPath = join(containerDir, '.env');
      const mycnfPath = join(containerDir, 'config', 'my.cnf');
      const timestamp = Date.now();
      const backupEnvPath = join(containerDir, `.env.backup.${timestamp}`);
      const backupMycnfPath = join(containerDir, `config/my.cnf.backup.${timestamp}`);

      // 2. Hacer backup de archivos actuales
      try {
        const currentEnv = await fileService.readFile(envPath);
        const currentMycnf = await fileService.readFile(mycnfPath);
        await fileService.writeFile(backupEnvPath, currentEnv);
        await fileService.writeFile(backupMycnfPath, currentMycnf);
        logger.info(`Backups created for ${slug}`);
      } catch (error: any) {
        logger.error('Error creating backups:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to create backups',
          message: error.message,
        });
      }

      // 3. Aplicar nueva memoria en .env
      try {
        const currentEnv = await fileService.readFile(envPath);
        const updatedEnv = currentEnv.replace(/MEM_LIMIT=.*/g, `MEM_LIMIT=${memoryLimit}`);
        await fileService.writeFile(envPath, updatedEnv);
        logger.info(`Updated MEM_LIMIT to ${memoryLimit} for ${slug}`);
      } catch (error: any) {
        logger.error('Error updating .env:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to update .env file',
          message: error.message,
        });
      }

      // 4. Aplicar nuevo my.cnf
      try {
        await fileService.writeFile(mycnfPath, mycnfContent);
        logger.info(`Updated my.cnf for ${slug}`);
      } catch (error: any) {
        logger.error('Error updating my.cnf:', error);
        // Rollback .env
        const backupEnv = await fileService.readFile(backupEnvPath);
        await fileService.writeFile(envPath, backupEnv);
        return res.status(500).json({
          success: false,
          error: 'Failed to update my.cnf file',
          message: error.message,
        });
      }

      // 5. Reiniciar contenedor
      try {
        await dockerService.restartContainer(containerDir);
        logger.info(`Container ${slug} restarted`);
      } catch (error: any) {
        logger.error('Error restarting container:', error);
        // Rollback ambos archivos
        const backupEnv = await fileService.readFile(backupEnvPath);
        const backupMycnf = await fileService.readFile(backupMycnfPath);
        await fileService.writeFile(envPath, backupEnv);
        await fileService.writeFile(mycnfPath, backupMycnf);
        return res.status(500).json({
          success: false,
          error: 'Failed to restart container',
          message: error.message,
          rollback: 'Configuration files restored to previous state',
        });
      }

      // 6. Esperar 10 segundos
      await new Promise(resolve => setTimeout(resolve, 10000));

      // 7. Verificar que contenedor está running sin errores
      try {
        const containerName = `mariadb-${slug}`;
        const isRunning = await dockerService.isContainerRunning(containerName);
        
        if (!isRunning) {
          logger.error(`Container ${slug} is not running after restart`);
          
          // 8. Rollback: restaurar archivos y reiniciar
          const backupEnv = await fileService.readFile(backupEnvPath);
          const backupMycnf = await fileService.readFile(backupMycnfPath);
          await fileService.writeFile(envPath, backupEnv);
          await fileService.writeFile(mycnfPath, backupMycnf);
          
          try {
            await dockerService.restartContainer(containerDir);
            logger.info(`Container ${slug} rolled back and restarted`);
            
            // 9. Verificar que rollback fue exitoso
            await new Promise(resolve => setTimeout(resolve, 5000));
            const isRunningAfterRollback = await dockerService.isContainerRunning(containerName);
            
            return res.status(500).json({
              success: false,
              error: 'Container failed to start with new configuration',
              rollback: 'Configuration restored to previous state',
              rollbackSuccessful: isRunningAfterRollback,
              message: 'The container could not start with the new configuration. Previous configuration has been restored.',
            });
          } catch (rollbackError: any) {
            logger.error('Error during rollback:', rollbackError);
            return res.status(500).json({
              success: false,
              error: 'Container failed and rollback also failed',
              message: 'Critical error: Please check container manually',
              rollbackError: rollbackError.message,
            });
          }
        }

        // Contenedor está corriendo correctamente
        logger.info(`Container ${slug} updated successfully`);
        return res.status(200).json({
          success: true,
          message: 'Container updated successfully',
          memoryLimit,
          innodbBufferPoolSize,
          containerRunning: true,
        });

      } catch (error: any) {
        logger.error('Error verifying container status:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to verify container status',
          message: error.message,
        });
      }

    } catch (error: any) {
      logger.error('Error updating container:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update container',
        message: error.message,
      });
    }
  }
}

export const containerController = new ContainerController();
