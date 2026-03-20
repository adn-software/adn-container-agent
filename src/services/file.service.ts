import { promises as fs } from 'fs';
import { join } from 'path';
import { logger } from './logger.service';
import { config } from '../config/config';

export class FileService {
  async copyDirectory(source: string, destination: string): Promise<void> {
    logger.info(`Copying directory from ${source} to ${destination}`);
    await fs.cp(source, destination, { recursive: true });
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    logger.info(`Writing file: ${filePath}`);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async readFile(filePath: string): Promise<string> {
    logger.info(`Reading file: ${filePath}`);
    return await fs.readFile(filePath, 'utf-8');
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async createDirectory(dirPath: string): Promise<void> {
    logger.info(`Creating directory: ${dirPath}`);
    await fs.mkdir(dirPath, { recursive: true });
  }

  async getContainerDirectory(slug: string): Promise<string> {
    return join(config.dockerDataPath, slug);
  }

  async createEnvFile(directory: string, envVars: Record<string, string>): Promise<void> {
    const envContent = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    await this.writeFile(join(directory, '.env'), envContent);
  }

  async createMyCnfFile(directory: string, content: string): Promise<void> {
    const configDir = join(directory, 'config');
    await this.createDirectory(configDir);
    await this.writeFile(join(configDir, 'my.cnf'), content);
  }
}

export const fileService = new FileService();
