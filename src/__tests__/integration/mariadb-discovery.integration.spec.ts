import request from 'supertest';
import { app } from '../../index';
import { setupTestContainer, cleanupTestContainers } from './setup-docker';

describe('MariaDB Discovery Integration', () => {
  let containerName: string;

  beforeAll(async () => {
    containerName = await setupTestContainer();
  }, 60000);

  afterAll(async () => {
    await cleanupTestContainers();
  }, 30000);

  it('should discover MariaDB containers', async () => {
    const response = await request(app)
      .get('/api/mariadb/discover')
      .set('Authorization', `Bearer ${process.env.AGENT_API_KEY || 'test-api-key'}`)
      .expect(200);

    expect(response.body.mariadbContainers).toBeDefined();
    expect(response.body.mariadbContainers.length).toBeGreaterThan(0);
    
    const container = response.body.mariadbContainers.find(
      (c: any) => c.containerName === containerName
    );
    
    expect(container).toBeDefined();
    expect(container.containerName).toBe(containerName);
    expect(container.mariadbVersion).toBeDefined();
    expect(container.mariadbVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(container.databases).toBeDefined();
    expect(Array.isArray(container.databases)).toBe(true);
  }, 30000);

  it('should discover databases in container', async () => {
    const response = await request(app)
      .get('/api/mariadb/discover')
      .set('Authorization', `Bearer ${process.env.AGENT_API_KEY || 'test-api-key'}`)
      .expect(200);

    const container = response.body.mariadbContainers.find(
      (c: any) => c.containerName === containerName
    );
    
    expect(container).toBeDefined();
    
    const testDb = container.databases.find((db: any) => db.databaseName === 'test_db');
    
    expect(testDb).toBeDefined();
    expect(testDb.databaseName).toBe('test_db');
    expect(testDb.charset).toBeDefined();
    expect(testDb.collation).toBeDefined();
    expect(testDb.sizeBytes).toBeGreaterThanOrEqual(0);
    expect(testDb.tableCount).toBeGreaterThanOrEqual(0);
  }, 30000);

  it('should return summary statistics', async () => {
    const response = await request(app)
      .get('/api/mariadb/discover')
      .set('Authorization', `Bearer ${process.env.AGENT_API_KEY || 'test-api-key'}`)
      .expect(200);

    expect(response.body.summary).toBeDefined();
    expect(response.body.summary.totalContainers).toBeGreaterThan(0);
    expect(response.body.summary.totalDatabases).toBeGreaterThan(0);
    expect(response.body.summary.totalSizeBytes).toBeGreaterThanOrEqual(0);
  }, 30000);

  it('should include server information', async () => {
    const response = await request(app)
      .get('/api/mariadb/discover')
      .set('Authorization', `Bearer ${process.env.AGENT_API_KEY || 'test-api-key'}`)
      .expect(200);

    expect(response.body.serverId).toBeDefined();
    expect(response.body.serverHostname).toBeDefined();
    expect(response.body.discoveredAt).toBeDefined();
    
    // Verificar que discoveredAt es una fecha válida
    const discoveredDate = new Date(response.body.discoveredAt);
    expect(discoveredDate.toString()).not.toBe('Invalid Date');
  }, 30000);

  it('should require authentication', async () => {
    await request(app)
      .get('/api/mariadb/discover')
      .expect(401);
  }, 30000);
});
