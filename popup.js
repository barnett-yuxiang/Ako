// Ako Key-Value Store - Main Entry Point
// Loads all required modules and initializes the application
(function () {
  'use strict';

  // Script loading utility
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }

  // Load all required scripts in order
  async function loadDependencies() {
    try {
      // Load in dependency order
      await loadScript('constants.js');
      await loadScript('logger.js');

      // Logger is automatically initialized as global singleton
      logger.info('Logger initialized');

      await loadScript('storage-manager.js');
      await loadScript('drag-drop-handler.js');
      await loadScript('ako-store.js');

      logger.info('All modules loaded successfully');
      return true;
    } catch (error) {
      // Use logger if available (loaded successfully), otherwise fallback to console
      if (typeof logger !== 'undefined') {
        logger.error('Failed to load modules', error);
      } else {
        // Fallback: logger.js itself failed to load
        console.error('[AKO] Failed to load modules:', error);
      }
      return false;
    }
  }

  // Initialize application after all scripts are loaded
  async function initializeApp() {
    const loaded = await loadDependencies();

    if (!loaded) {
      logger.error('Cannot start application - module loading failed');
      return;
    }

    try {
      // At this point, all modules including logger are loaded successfully
      // Initialize the main application
      window.akoStore = new AkoStore();
      logger.info('Application initialized successfully');

      // Cleanup flag to prevent multiple cleanup calls
      let isCleanedUp = false;

      // Handle popup close event (specific to Chrome extensions)
      // Note: In Chrome extension popups, only 'unload' is reliable
      window.addEventListener('unload', () => {
        if (window.akoStore && !isCleanedUp) {
          isCleanedUp = true;
          logger.debug('Popup closing, running cleanup');
          window.akoStore.cleanup();
        }
      });
    } catch (error) {
      logger.error('Failed to initialize application', error);
    }
  }

  // Start the application when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
  } else {
    initializeApp();
  }
})();
