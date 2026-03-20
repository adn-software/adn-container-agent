import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.AGENT_PORT || '3100', 10),
  apiKey: process.env.AGENT_API_KEY || '',
  dockerDataPath: process.env.DOCKER_DATA_PATH || '/var/docker-data/mariadb',
  templatePath: process.env.TEMPLATE_PATH || '/home/adn/mariadb-client',
  logLevel: process.env.LOG_LEVEL || 'info',
};

// Validar configuración requerida
if (!config.apiKey) {
  throw new Error('AGENT_API_KEY is required');
}
