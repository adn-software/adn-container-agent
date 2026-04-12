import { logger } from '../services/logger.service';

/**
 * Ejecuta una función con reintentos y backoff exponencial
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    operationName?: string;
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries || 3;
  const initialDelay = options.initialDelay || 1000;
  const operationName = options.operationName || 'operation';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;
      
      if (isLastAttempt) {
        logger.error(`${operationName} failed after ${maxRetries} attempts`, {
          error: error instanceof Error ? error.message : 'Unknown error',
          attempts: maxRetries,
        });
        throw error;
      }

      const delay = initialDelay * Math.pow(2, attempt);
      logger.warn(`${operationName} failed, retrying in ${delay}ms`, {
        attempt: attempt + 1,
        maxRetries,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Retry logic error');
}
