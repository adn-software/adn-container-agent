/**
 * Valida los datos de un contenedor
 */
export function validateContainerData(container: any): void {
  if (!container) {
    throw new Error('Container data is null or undefined');
  }

  if (!container.id || typeof container.id !== 'string') {
    throw new Error('Container ID is missing or invalid');
  }

  if (!container.name || typeof container.name !== 'string') {
    throw new Error('Container name is missing or invalid');
  }

  if (!container.status || typeof container.status !== 'string') {
    throw new Error('Container status is missing or invalid');
  }
}

/**
 * Valida los datos de una base de datos
 */
export function validateDatabaseData(database: any): void {
  if (!database) {
    throw new Error('Database data is null or undefined');
  }

  if (!database.databaseName || typeof database.databaseName !== 'string') {
    throw new Error('Database name is missing or invalid');
  }

  if (typeof database.sizeBytes !== 'number' || database.sizeBytes < 0) {
    throw new Error('Database size is missing or invalid');
  }

  if (typeof database.tableCount !== 'number' || database.tableCount < 0) {
    throw new Error('Database table count is missing or invalid');
  }
}

/**
 * Valida la información completa de un contenedor MariaDB
 */
export function validateMariaDBContainerInfo(containerInfo: any): void {
  if (!containerInfo) {
    throw new Error('Container info is null or undefined');
  }

  if (!containerInfo.containerName || typeof containerInfo.containerName !== 'string') {
    throw new Error('Container name is missing or invalid');
  }

  if (!containerInfo.containerId || typeof containerInfo.containerId !== 'string') {
    throw new Error('Container ID is missing or invalid');
  }

  if (!containerInfo.mariadbVersion || typeof containerInfo.mariadbVersion !== 'string') {
    throw new Error('MariaDB version is missing or invalid');
  }

  if (!Array.isArray(containerInfo.databases)) {
    throw new Error('Databases array is missing or invalid');
  }

  // Validar cada base de datos
  containerInfo.databases.forEach((db: any, index: number) => {
    try {
      validateDatabaseData(db);
    } catch (error) {
      throw new Error(
        `Invalid database at index ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });
}
