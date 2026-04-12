import {
  validateContainerData,
  validateDatabaseData,
  validateMariaDBContainerInfo,
} from '../utils/validation.util';

describe('Validation Utils', () => {
  describe('validateContainerData', () => {
    it('should pass with valid container data', () => {
      const validContainer = {
        id: 'abc123',
        name: 'mariadb-test',
        status: 'Up 2 hours',
      };

      expect(() => validateContainerData(validContainer)).not.toThrow();
    });

    it('should throw if container is null', () => {
      expect(() => validateContainerData(null)).toThrow('Container data is null or undefined');
    });

    it('should throw if id is missing', () => {
      const invalidContainer = {
        name: 'mariadb-test',
        status: 'Up 2 hours',
      };

      expect(() => validateContainerData(invalidContainer)).toThrow('Container ID is missing or invalid');
    });

    it('should throw if name is missing', () => {
      const invalidContainer = {
        id: 'abc123',
        status: 'Up 2 hours',
      };

      expect(() => validateContainerData(invalidContainer)).toThrow('Container name is missing or invalid');
    });

    it('should throw if status is missing', () => {
      const invalidContainer = {
        id: 'abc123',
        name: 'mariadb-test',
      };

      expect(() => validateContainerData(invalidContainer)).toThrow('Container status is missing or invalid');
    });
  });

  describe('validateDatabaseData', () => {
    it('should pass with valid database data', () => {
      const validDatabase = {
        databaseName: 'test_db',
        sizeBytes: 1024,
        tableCount: 5,
      };

      expect(() => validateDatabaseData(validDatabase)).not.toThrow();
    });

    it('should throw if database is null', () => {
      expect(() => validateDatabaseData(null)).toThrow('Database data is null or undefined');
    });

    it('should throw if databaseName is missing', () => {
      const invalidDatabase = {
        sizeBytes: 1024,
        tableCount: 5,
      };

      expect(() => validateDatabaseData(invalidDatabase)).toThrow('Database name is missing or invalid');
    });

    it('should throw if sizeBytes is negative', () => {
      const invalidDatabase = {
        databaseName: 'test_db',
        sizeBytes: -100,
        tableCount: 5,
      };

      expect(() => validateDatabaseData(invalidDatabase)).toThrow('Database size is missing or invalid');
    });

    it('should throw if tableCount is negative', () => {
      const invalidDatabase = {
        databaseName: 'test_db',
        sizeBytes: 1024,
        tableCount: -1,
      };

      expect(() => validateDatabaseData(invalidDatabase)).toThrow('Database table count is missing or invalid');
    });
  });

  describe('validateMariaDBContainerInfo', () => {
    it('should pass with valid container info', () => {
      const validInfo = {
        containerName: 'mariadb-test',
        containerId: 'abc123',
        mariadbVersion: '10.11.6',
        databases: [
          {
            databaseName: 'test_db',
            sizeBytes: 1024,
            tableCount: 5,
          },
        ],
      };

      expect(() => validateMariaDBContainerInfo(validInfo)).not.toThrow();
    });

    it('should throw if containerInfo is null', () => {
      expect(() => validateMariaDBContainerInfo(null)).toThrow('Container info is null or undefined');
    });

    it('should throw if databases is not an array', () => {
      const invalidInfo = {
        containerName: 'mariadb-test',
        containerId: 'abc123',
        mariadbVersion: '10.11.6',
        databases: 'not-an-array',
      };

      expect(() => validateMariaDBContainerInfo(invalidInfo)).toThrow('Databases array is missing or invalid');
    });

    it('should throw if a database in the array is invalid', () => {
      const invalidInfo = {
        containerName: 'mariadb-test',
        containerId: 'abc123',
        mariadbVersion: '10.11.6',
        databases: [
          {
            databaseName: 'test_db',
            sizeBytes: 1024,
            tableCount: 5,
          },
          {
            databaseName: 'invalid_db',
            sizeBytes: -100, // Invalid
            tableCount: 5,
          },
        ],
      };

      expect(() => validateMariaDBContainerInfo(invalidInfo)).toThrow('Invalid database at index 1');
    });
  });
});
