// Logger class for debugging and monitoring (Singleton Pattern)
class AkoLogger {
  static instance = null;

  constructor() {
    // Singleton: return existing instance if already created
    if (AkoLogger.instance) {
      return AkoLogger.instance;
    }

    // Detect if it's production based on manifest
    // Chrome Web Store automatically adds 'update_url' to published extensions
    this.enabled = !('update_url' in chrome.runtime.getManifest());
    this.logLevel = this.enabled ? 'debug' : 'info';

    // Store as singleton instance
    AkoLogger.instance = this;
  }

  // Static method to get singleton instance
  static getInstance() {
    if (!AkoLogger.instance) {
      AkoLogger.instance = new AkoLogger();
    }
    return AkoLogger.instance;
  }

  debug(message, data = null) {
    if (this.enabled && this._shouldLog('debug')) {
      console.log(`[AKO-DEBUG] ${message}`, data || '');
    }
  }

  info(message, data = null) {
    if (this.enabled && this._shouldLog('info')) {
      console.log(`[AKO-INFO] ${message}`, data || '');
    }
  }

  warn(message, data = null) {
    if (this.enabled && this._shouldLog('warn')) {
      console.warn(`[AKO-WARN] ${message}`, data || '');
    }
  }

  error(message, error = null) {
    if (this.enabled) {
      console.error(`[AKO-ERROR] ${message}`, error || '');
    }
  }

  performance(operation, duration, details = null) {
    if (this.enabled) {
      console.log(`[AKO-PERF] ${operation}: ${duration}ms`, details || '');
    }
  }

  _shouldLog(level) {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }
}

// Create global singleton instance for easy access
// Usage: logger.info('message') instead of new AkoLogger().info('message')
const logger = AkoLogger.getInstance();
