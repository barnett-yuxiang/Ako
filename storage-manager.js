// Storage Manager with quota monitoring
class StorageManager {
  constructor() {
  }

  // Load items from chrome.storage.local with migration support
  async loadItems() {
    const startTime = performance.now();

    try {
      logger.debug('Loading items from storage');
      const result = await chrome.storage.local.get([CONSTANTS.STORAGE_KEY]);
      const data = result[CONSTANTS.STORAGE_KEY] || {};

      let items = [];

      // Migration: convert old object format to array format
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        logger.info('Migrating data from object to array format', { oldCount: Object.keys(data).length });
        items = Object.values(data).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        // Save in new format
        await this.saveItems(items);
        logger.info('Data migration completed', { newCount: items.length });
      } else if (Array.isArray(data)) {
        items = data;
        logger.debug('Loaded items in array format', { count: items.length });
      } else {
        items = [];
        logger.debug('No existing data found, initialized empty array');
      }

      const loadTime = performance.now() - startTime;
      logger.performance('Data loading', loadTime, { itemCount: items.length });

      // Check storage quota after loading
      await this.checkStorageQuota();

      return items;

    } catch (error) {
      logger.error('Failed to load items from storage', error);
      return [];
    }
  }

  // Save items to chrome.storage.local
  async saveItems(items) {
    const startTime = performance.now();

    try {
      logger.debug('Saving items to storage', { count: items.length });
      await chrome.storage.local.set({ [CONSTANTS.STORAGE_KEY]: items });

      const saveTime = performance.now() - startTime;
      logger.performance('Data saving', saveTime, { itemCount: items.length });

      // Check quota after saving
      await this.checkStorageQuota();

    } catch (error) {
      logger.error('Failed to save items to storage', error);
      throw error;
    }
  }

  // Check storage quota and warn if approaching limit
  async checkStorageQuota() {
    try {
      const bytesInUse = await chrome.storage.local.getBytesInUse(CONSTANTS.STORAGE_KEY);
      const usagePercent = bytesInUse / CONSTANTS.STORAGE_QUOTA_MAX;

      logger.debug('Storage quota check', {
        bytesInUse,
        maxBytes: CONSTANTS.STORAGE_QUOTA_MAX,
        usagePercent: `${(usagePercent * 100).toFixed(2)}%`
      });

      // Warn if approaching limit
      if (usagePercent >= CONSTANTS.STORAGE_QUOTA_WARNING_THRESHOLD) {
        logger.warn('Storage quota warning', {
          bytesInUse,
          percentUsed: `${(usagePercent * 100).toFixed(1)}%`,
          remaining: CONSTANTS.STORAGE_QUOTA_MAX - bytesInUse
        });

        return {
          warning: true,
          bytesInUse,
          usagePercent,
          message: `Storage is ${(usagePercent * 100).toFixed(1)}% full. Consider removing old items.`
        };
      }

      return {
        warning: false,
        bytesInUse,
        usagePercent
      };

    } catch (error) {
      logger.error('Failed to check storage quota', error);
      return { warning: false, error: true };
    }
  }

  // Get storage info for display
  async getStorageInfo() {
    try {
      const bytesInUse = await chrome.storage.local.getBytesInUse(CONSTANTS.STORAGE_KEY);
      return {
        bytesInUse,
        maxBytes: CONSTANTS.STORAGE_QUOTA_MAX,
        usagePercent: bytesInUse / CONSTANTS.STORAGE_QUOTA_MAX,
        remaining: CONSTANTS.STORAGE_QUOTA_MAX - bytesInUse
      };
    } catch (error) {
      logger.error('Failed to get storage info', error);
      return null;
    }
  }
}
