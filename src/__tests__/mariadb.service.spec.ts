import { MariaDBService } from '../services/mariadb.service';

describe('MariaDBService', () => {
  let service: MariaDBService;

  beforeEach(() => {
    service = new MariaDBService();
    // Limpiar caché antes de cada test
    service.clearCache();
  });

  describe('Cache functionality', () => {
    it('should cache discovery results', async () => {
      // Mock del método performDiscovery
      const performDiscoverySpy = jest.spyOn(service as any, 'performDiscovery');
      performDiscoverySpy.mockResolvedValue([
        {
          containerName: 'test-container',
          containerId: 'abc123',
          status: 'running',
          mariadbVersion: '10.11.6',
          host: 'localhost',
          port: 3306,
          rootPassword: 'password',
          databases: [],
        },
      ]);

      // Primera llamada - debe ejecutar performDiscovery
      const result1 = await service.discoverContainers();
      expect(performDiscoverySpy).toHaveBeenCalledTimes(1);
      expect(result1).toHaveLength(1);

      // Segunda llamada - debe usar caché
      const result2 = await service.discoverContainers();
      expect(performDiscoverySpy).toHaveBeenCalledTimes(1); // No debe llamarse de nuevo
      expect(result2).toEqual(result1);

      performDiscoverySpy.mockRestore();
    });

    it('should clear cache when clearCache is called', async () => {
      const performDiscoverySpy = jest.spyOn(service as any, 'performDiscovery');
      performDiscoverySpy.mockResolvedValue([]);

      // Primera llamada
      await service.discoverContainers();
      expect(performDiscoverySpy).toHaveBeenCalledTimes(1);

      // Limpiar caché
      service.clearCache();

      // Segunda llamada - debe ejecutar performDiscovery de nuevo
      await service.discoverContainers();
      expect(performDiscoverySpy).toHaveBeenCalledTimes(2);

      performDiscoverySpy.mockRestore();
    });

    it('should expire cache after TTL', async () => {
      // Configurar TTL muy corto antes de crear el servicio
      const originalCacheTTL = process.env.CACHE_TTL;
      process.env.CACHE_TTL = '100'; // 100ms
      
      // Crear servicio con TTL muy corto para testing
      const shortTTLService = new MariaDBService();

      const performDiscoverySpy = jest.spyOn(shortTTLService as any, 'performDiscovery');
      performDiscoverySpy.mockResolvedValue([]);

      // Primera llamada
      await shortTTLService.discoverContainers();
      expect(performDiscoverySpy).toHaveBeenCalledTimes(1);

      // Esperar a que expire el caché
      await new Promise(resolve => setTimeout(resolve, 150));

      // Segunda llamada - debe ejecutar performDiscovery de nuevo
      await shortTTLService.discoverContainers();
      expect(performDiscoverySpy).toHaveBeenCalledTimes(2);

      performDiscoverySpy.mockRestore();
      
      // Restaurar valor original
      if (originalCacheTTL) {
        process.env.CACHE_TTL = originalCacheTTL;
      } else {
        delete process.env.CACHE_TTL;
      }
    }, 10000);
  });

  describe('Timeout functionality', () => {
    it('should timeout if discovery takes too long', async () => {
      // Crear servicio con timeout muy corto
      process.env.DISCOVERY_TIMEOUT = '100'; // 100ms
      const timeoutService = new MariaDBService();

      const performDiscoverySpy = jest.spyOn(timeoutService as any, 'performDiscovery');
      performDiscoverySpy.mockImplementation(() => {
        return new Promise(resolve => setTimeout(() => resolve([]), 500)); // 500ms
      });

      await expect(timeoutService.discoverContainers()).rejects.toThrow('Discovery timeout');

      performDiscoverySpy.mockRestore();
      delete process.env.DISCOVERY_TIMEOUT;
    });

    it('should complete if discovery finishes before timeout', async () => {
      process.env.DISCOVERY_TIMEOUT = '1000'; // 1 segundo
      const timeoutService = new MariaDBService();

      const performDiscoverySpy = jest.spyOn(timeoutService as any, 'performDiscovery');
      performDiscoverySpy.mockImplementation(() => {
        return new Promise(resolve => setTimeout(() => resolve([]), 50)); // 50ms
      });

      const result = await timeoutService.discoverContainers();
      expect(result).toEqual([]);

      performDiscoverySpy.mockRestore();
      delete process.env.DISCOVERY_TIMEOUT;
    });
  });
});
