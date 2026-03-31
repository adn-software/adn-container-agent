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

    // Validar formato básico de secciones
    const sectionRegex = /^\[[\w-]+\]$/gm;
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Ignorar líneas vacías y comentarios
      if (line.length === 0 || line.startsWith('#') || line.startsWith(';')) {
        continue;
      }

      // Verificar si es una sección
      if (line.startsWith('[')) {
        if (!sectionRegex.test(line)) {
          errors.push(`Línea ${i + 1}: Formato de sección inválido: ${line}`);
        }
        continue;
      }

      // Verificar formato de variable (debe tener = o ser una directiva válida)
      if (!line.includes('=') && !line.startsWith('!')) {
        // Algunas directivas no requieren =, como skip-name-resolve
        const validDirectives = ['skip-name-resolve', 'skip-networking', 'skip-grant-tables'];
        if (!validDirectives.some(d => line.startsWith(d))) {
          errors.push(`Línea ${i + 1}: Formato de variable inválido (debe contener '='): ${line}`);
        }
      }
    }

    // Validar que no haya caracteres extraños que puedan causar problemas
    const invalidChars = /[^\x00-\x7F]/g;
    if (invalidChars.test(content)) {
      errors.push('El archivo contiene caracteres no ASCII que pueden causar problemas');
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
