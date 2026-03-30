import express from 'express';
import cors from 'cors';
import { config } from './config/config';
import { logger } from './services/logger.service';
import { authMiddleware } from './middleware/auth.middleware';
import { containerController } from './controllers/container.controller';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Rutas públicas (sin autenticación)
app.get('/api/health', (req, res) => containerController.healthCheck(req, res));
app.get('/api/ping', (req, res) => containerController.ping(req, res));

// Rutas protegidas (con autenticación)
app.use('/api', authMiddleware);

app.post('/api/containers/create', (req, res) => containerController.createContainer(req, res));
app.get('/api/containers/list', (req, res) => containerController.listContainers(req, res));
app.get('/api/containers/:slug/status', (req, res) => containerController.getContainerStatus(req, res));
app.get('/api/containers/:slug/config', (req, res) => containerController.getContainerConfig(req, res));
app.post('/api/containers/:slug/ping', (req, res) => containerController.pingContainer(req, res));
app.get('/api/containers/:slug/health', (req, res) => containerController.getContainerHealth(req, res));
app.get('/api/ping', (req, res) => containerController.ping(req, res));

// Manejo de errores global
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Iniciar servidor
app.listen(config.port, () => {
  logger.info(`ADN Container Agent listening on port ${config.port}`);
  logger.info(`Docker data path: ${config.dockerDataPath}`);
  logger.info(`Template path: ${config.templatePath}`);
});

// Manejo de señales de terminación
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});
