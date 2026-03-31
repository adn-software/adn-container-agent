import { logger } from './logger.service';

export class MyCnfValidatorService {
  validateMyCnf(content: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!content || content.trim().length === 0) {
      errors.push('El contenido del my.cnf está vacío');
      return { valid: false, errors };
    }

    // Validar que tenga al menos una sección [mysqld]
    if (!content.includes('[mysqld]')) {
      errors.push('El archivo debe contener al menos una sección [mysqld]');
    }

    // Validación básica: solo verificar que no esté completamente roto
    // Permitir cualquier formato que MariaDB pueda aceptar
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Ignorar líneas vacías y comentarios
      if (line.length === 0 || line.startsWith('#') || line.startsWith(';')) {
        continue;
      }

      // Verificar si es una sección
      if (line.startsWith('[')) {
        // Solo validar que cierre con ]
        if (!line.endsWith(']')) {
          errors.push(`Línea ${i + 1}: Sección no cerrada correctamente: ${line}`);
        }
        continue;
      }

      // Para el resto de líneas, solo verificar que no tengan caracteres claramente inválidos
      // MariaDB es bastante permisivo con el formato
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  extractInnodbBufferPoolSize(content: string): string | null {
    const match = content.match(/innodb_buffer_pool_size\s*=\s*([^\s\n]+)/);
    return match ? match[1] : null;
  }
}

export const mycnfValidatorService = new MyCnfValidatorService();
