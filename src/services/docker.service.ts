import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger.service';

const execAsync = promisify(exec);

export class DockerService {
  private composeCommand: string | null = null;

  async executeCommand(command: string): Promise<{ stdout: string; stderr: string }> {
    try {
      logger.info(`Executing: ${command}`);
      const result = await execAsync(command);
      return result;
    } catch (error: any) {
      logger.error(`Command failed: ${command}`, error);
      throw error;
    }
  }

  async detectComposeCommand(): Promise<string> {
    if (this.composeCommand) {
      return this.composeCommand;
    }

    // Try docker compose (v2)
    try {
      await execAsync('docker compose version');
      this.composeCommand = 'docker compose';
      logger.info('Detected docker compose (v2)');
      return this.composeCommand;
    } catch (error: any) {
      // Check if error contains "unknown command" or similar
      const errorMsg = error.message?.toLowerCase() || '';
      if (!errorMsg.includes('unknown') && !errorMsg.includes('not found')) {
        // Command exists but failed for another reason, still use it
        this.composeCommand = 'docker compose';
        logger.info('Detected docker compose (v2) - command exists');
        return this.composeCommand;
      }
      logger.debug('docker compose not available:', error.message);
    }

    // Try docker-compose (v1)
    try {
      await execAsync('docker-compose version');
      this.composeCommand = 'docker-compose';
      logger.info('Detected docker-compose (v1)');
      return this.composeCommand;
    } catch (error: any) {
      const errorMsg = error.message?.toLowerCase() || '';
      if (!errorMsg.includes('unknown') && !errorMsg.includes('not found')) {
        this.composeCommand = 'docker-compose';
        logger.info('Detected docker-compose (v1) - command exists');
        return this.composeCommand;
      }
      logger.debug('docker-compose not available:', error.message);
    }

    throw new Error('Neither docker compose nor docker-compose is available');
  }

  async listContainers(): Promise<any[]> {
    const { stdout } = await this.executeCommand(
      'docker ps -a --filter "ancestor=mariadb:10.5" --format "{{json .}}"'
    );

    if (!stdout.trim()) {
      return [];
    }

    const lines = stdout.trim().split('\n');
    return lines.map(line => JSON.parse(line));
  }

  async inspectContainer(containerName: string): Promise<any> {
    const { stdout } = await this.executeCommand(
      `docker inspect ${containerName}`
    );
    const data = JSON.parse(stdout);
    return data[0];
  }

  async getContainerLogs(containerName: string, lines: number = 100): Promise<string> {
    const { stdout } = await this.executeCommand(
      `docker logs --tail ${lines} ${containerName}`
    );
    return stdout;
  }

  async containerExists(containerName: string): Promise<boolean> {
    try {
      await this.executeCommand(`docker inspect ${containerName}`);
      return true;
    } catch {
      return false;
    }
  }

  async isContainerRunning(containerName: string): Promise<boolean> {
    try {
      const { stdout } = await this.executeCommand(
        `docker ps --filter "name=${containerName}" --format "{{.Names}}"`
      );
      return stdout.trim() === containerName;
    } catch {
      return false;
    }
  }

  async startContainer(containerName: string): Promise<void> {
    await this.executeCommand(`docker start ${containerName}`);
  }

  async stopContainer(containerName: string): Promise<void> {
    await this.executeCommand(`docker stop ${containerName}`);
  }

  async composeUp(directory: string): Promise<void> {
    const composeCmd = await this.detectComposeCommand();
    await this.executeCommand(`cd ${directory} && ${composeCmd} up -d`);
  }

  async composeDown(directory: string): Promise<void> {
    const composeCmd = await this.detectComposeCommand();
    await this.executeCommand(`cd ${directory} && ${composeCmd} down`);
  }
}

export const dockerService = new DockerService();
