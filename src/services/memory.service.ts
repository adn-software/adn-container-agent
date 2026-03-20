export class MemoryService {
  parseMemory(memoryString: string): number {
    const cleaned = memoryString.trim().toUpperCase();
    const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*([GMK])?$/);
    
    if (!match) {
      throw new Error(`Invalid memory format: ${memoryString}`);
    }
    
    const value = parseFloat(match[1]);
    const unit = match[2] || 'M';
    
    // Convertir a bytes
    switch (unit) {
      case 'G':
        return value * 1024 * 1024 * 1024;
      case 'M':
        return value * 1024 * 1024;
      case 'K':
        return value * 1024;
      default:
        return value;
    }
  }

  formatMemory(bytes: number): string {
    const gb = 1024 * 1024 * 1024;
    const mb = 1024 * 1024;
    
    // Calcular en MB con redondeo hacia arriba
    let mbValue = Math.ceil(bytes / mb);
    
    // Si es mayor o igual a 1024 MB, convertir a GB
    if (mbValue >= 1024) {
      const gbValue = Math.ceil(mbValue / 1024);
      return `${gbValue}g`;
    }
    
    return `${mbValue}m`;
  }

  calculateContainerMemory(innodbMemory: string): string {
    const bytes = this.parseMemory(innodbMemory);
    const withMargin = Math.ceil(bytes * 1.3); // +30%
    return this.formatMemory(withMargin);
  }

  extractInnodbMemory(mycnfContent: string): string | null {
    const match = mycnfContent.match(/^innodb_buffer_pool_size\s*=\s*(.+)$/m);
    return match ? match[1].trim() : null;
  }
}

export const memoryService = new MemoryService();
