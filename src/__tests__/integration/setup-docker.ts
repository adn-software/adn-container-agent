import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function setupTestContainer() {
  const containerName = `mariadb-test-${Date.now()}`;
  
  try {
    // Crear contenedor MariaDB de prueba
    const { stdout } = await execAsync(`
      docker run -d \
        --name ${containerName} \
        -e MYSQL_ROOT_PASSWORD=testpass \
        -e MYSQL_DATABASE=test_db \
        -p 0:3306 \
        mariadb:10.11
    `);
    
    console.log(`Created container: ${containerName}, ID: ${stdout.trim()}`);

    // Esperar a que esté listo (verificar que el servidor esté aceptando conexiones)
    let ready = false;
    let attempts = 0;
    const maxAttempts = 30;

    while (!ready && attempts < maxAttempts) {
      try {
        await execAsync(`docker exec ${containerName} mysql -uroot -ptestpass -e "SELECT 1" 2>/dev/null`);
        ready = true;
      } catch (error) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!ready) {
      throw new Error('MariaDB container failed to start in time');
    }

    return containerName;
  } catch (error) {
    console.error('Error setting up test container:', error);
    throw error;
  }
}

export async function cleanupTestContainers() {
  try {
    const { stdout } = await execAsync('docker ps -a --filter "name=mariadb-test-" --format "{{.Names}}"');
    const containers = stdout.trim().split('\n').filter(Boolean);

    for (const container of containers) {
      try {
        await execAsync(`docker stop ${container} 2>/dev/null || true`);
        await execAsync(`docker rm ${container} 2>/dev/null || true`);
      } catch (error) {
        console.error(`Error cleaning up container ${container}:`, error);
      }
    }
  } catch (error) {
    console.error('Error cleaning up test containers:', error);
  }
}
