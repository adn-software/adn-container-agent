import { MariaDBController } from '../controllers/mariadb.controller';
import { mariadbService } from '../services/mariadb.service';
import { Request, Response } from 'express';

jest.mock('../services/mariadb.service');

describe('MariaDBController', () => {
  let controller: MariaDBController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    controller = new MariaDBController();
    mockRequest = {};
    mockResponse = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('discover', () => {
    it('should return discovered MariaDB containers', async () => {
      const mockContainers = [
        {
          containerName: 'mariadb-test',
          containerId: 'abc123',
          status: 'running',
          mariadbVersion: '10.11.6',
          host: 'localhost',
          port: 3306,
          rootPassword: 'password',
          databases: [
            {
              databaseName: 'test_db',
              charset: 'utf8mb4',
              collation: 'utf8mb4_unicode_ci',
              sizeBytes: 1024,
              tableCount: 10,
              createdAt: '2024-01-15T00:00:00Z',
            },
          ],
        },
      ];

      (mariadbService.discoverContainers as jest.Mock).mockResolvedValue(mockContainers);

      await controller.discover(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          mariadbContainers: mockContainers,
          summary: expect.objectContaining({
            totalContainers: 1,
            totalDatabases: 1,
          }),
        })
      );
    });

    it('should handle errors', async () => {
      (mariadbService.discoverContainers as jest.Mock).mockRejectedValue(
        new Error('Docker not available')
      );

      await controller.discover(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Failed to discover MariaDB containers',
        })
      );
    });
  });
});
