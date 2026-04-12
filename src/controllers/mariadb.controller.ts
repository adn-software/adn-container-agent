import { Request, Response } from 'express';
import { mariadbService } from '../services/mariadb.service';
import { logger } from '../services/logger.service';

export class MariaDBController {
  /**
   * GET /api/mariadb/discover
   * Descubre todos los contenedores MariaDB y sus bases de datos
   */
  async discover(req: Request, res: Response) {
    try {
      logger.info('MariaDB discovery requested');

      const mariadbContainers = await mariadbService.discoverContainers();

      const summary = {
        totalContainers: mariadbContainers.length,
        totalDatabases: mariadbContainers.reduce(
          (sum: number, c: any) => sum + c.databases.length,
          0
        ),
        totalSizeBytes: mariadbContainers.reduce(
          (sum: number, c: any) =>
            sum + c.databases.reduce((dbSum: number, db: any) => dbSum + db.sizeBytes, 0),
          0
        ),
      };

      const response = {
        serverId: process.env.SERVER_ID || 'unknown',
        serverHostname: require('os').hostname(),
        discoveredAt: new Date().toISOString(),
        mariadbContainers,
        summary,
      };

      logger.info('MariaDB discovery completed successfully');
      res.json(response);
    } catch (error) {
      logger.error('MariaDB discovery failed:', error);
      res.status(500).json({
        error: 'Failed to discover MariaDB containers',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: {},
      });
    }
  }
}

export const mariadbController = new MariaDBController();
