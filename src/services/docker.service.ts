import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger.service';

const execAsync = promisify(exec);

export class DockerService {
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
    await this.executeCommand(`cd ${directory} && docker compose up -d`);
  }

  async composeDown(directory: string): Promise<void> {
    await this.executeCommand(`cd ${directory} && docker compose down`);
  }
}

export const dockerService = new DockerService();
