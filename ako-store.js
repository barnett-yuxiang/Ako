// Main AkoStore class - simplified with separated concerns
class AkoStore {
  constructor() {
    // Storage manager
    this.storageManager = new StorageManager();

    // Drag & Drop handler
    this.dragDropHandler = new DragDropHandler();

    // Data
    this.items = [];
    this.editingId = null;
    this.valuesVisible = false; // Default hidden

    // DOM element cache
    this.domCache = {};

    // Performance metrics
    this.performanceMetrics = {
      loadTime: 0,
      renderTime: 0,
      lastRenderItems: 0
    };

    // AbortController for proper event cleanup
    this.abortController = new AbortController();
    this.signal = this.abortController.signal;

    // Lifecycle state
    this.isDestroyed = false;
    this.forceRerender = false;

    this.init();
  }

  // Utility: Debounce function
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Initialize DOM cache
  initDOMCache() {
    this.domCache = {
      keyInput: document.querySelector(CONSTANTS.SELECTORS.KEY_INPUT),
      valueInput: document.querySelector(CONSTANTS.SELECTORS.VALUE_INPUT),
      addBtn: document.querySelector(CONSTANTS.SELECTORS.ADD_BTN),
      clearAllBtn: document.querySelector(CONSTANTS.SELECTORS.CLEAR_ALL_BTN),
      toggleVisibilityBtn: document.querySelector(CONSTANTS.SELECTORS.TOGGLE_VISIBILITY_BTN),
      itemsList: document.querySelector(CONSTANTS.SELECTORS.ITEMS_LIST),
      itemCount: document.querySelector(CONSTANTS.SELECTORS.ITEM_COUNT)
    };

    // Validate all elements exist
    for (const [key, element] of Object.entries(this.domCache)) {
      if (!element) {
        logger.error(`DOM element not found: ${key}`);
      }
    }
  }

  // Initialize
  async init() {
    const startTime = performance.now();
    logger.info('Initializing AkoStore');

    try {
      this.initDOMCache();
      this.items = await this.storageManager.loadItems();
      this.setupEventListeners();
      this.renderItems();
      this.validateInput();
      this.updateClearAllButton();
      this.updateVisibilityButton();

      const initTime = performance.now() - startTime;
      this.performanceMetrics.loadTime = initTime;
      logger.performance('Initialization', initTime, { itemCount: this.items.length });
      logger.info('AkoStore initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize AkoStore', error);
      throw error;
    }
  }

  // Setup event listeners
  setupEventListeners() {
    logger.debug('Setting up event listeners');

    const { keyInput, valueInput, addBtn, clearAllBtn, toggleVisibilityBtn, itemsList } = this.domCache;

    // Button events
    addBtn.addEventListener('click', () => this.addItem());
    clearAllBtn.addEventListener('click', () => this.showClearAllConfirm());
    toggleVisibilityBtn.addEventListener('click', () => this.toggleValueVisibility());

    // Keyboard events
    keyInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        valueInput.focus();
      }
    });

    valueInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.addItem();
      }
    });

    // Input validation with debouncing
    const validateDebounced = this.debounce(() => this.validateInput(), 100);
    keyInput.addEventListener('input', validateDebounced);
    valueInput.addEventListener('input', validateDebounced);

    // Event delegation for item actions
    itemsList.addEventListener('click', (e) => this.handleItemClick(e));

    // Drag and drop events
    itemsList.addEventListener('mousedown', (e) => {
      if (this.dragDropHandler.handleMouseDown(e, this.items, this.domCache.itemsList)) {
        // Drag initiated
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (this.dragDropHandler.handleMouseMove(e, this.items, this.domCache.itemsList)) {
        // Dragging in progress
      }
    }, { signal: this.signal });

    document.addEventListener('mouseup', async (e) => {
      if (this.isDestroyed) return;

      const result = await this.dragDropHandler.handleMouseUp(e, this.items, async (items) => {
        await this.storageManager.saveItems(items);
      });

      if (result && result.reordered) {
        this.items = result.items;
        this.forceRerender = true;
        this.renderItems();
      }
    }, { signal: this.signal });

    logger.debug('Event listeners setup completed');
  }

  // Handle item click events
  handleItemClick(e) {
    const button = e.target.closest('button');
    if (!button) return;

    const itemElement = button.closest('.item');
    if (!itemElement) return;

    const itemIndex = parseInt(itemElement.dataset.index);
    if (isNaN(itemIndex) || itemIndex < 0 || itemIndex >= this.items.length) {
      logger.warn('Invalid item index in click handler', { index: itemIndex });
      return;
    }

    const actionHandlers = {
      'copy-btn': () => this.copyToClipboard(this.items[itemIndex]?.value),
      'edit-btn': () => this.editItem(itemIndex),
      'delete-btn': () => this.deleteItem(itemIndex),
      'save-btn': () => this.saveEdit(itemIndex),
      'cancel-btn': () => this.cancelEdit(),
      'confirm-yes': () => this.confirmDelete(itemIndex),
      'confirm-no': () => this.cancelDelete(itemIndex)
    };

    for (const [className, handler] of Object.entries(actionHandlers)) {
      if (button.classList.contains(className)) {
        handler();
        break;
      }
    }
  }

  // Validate input
  validateInput() {
    const { keyInput, valueInput, addBtn } = this.domCache;
    const hasKey = keyInput.value.trim().length > 0;
    const hasValue = valueInput.value.trim().length > 0;
    addBtn.disabled = !(hasKey && hasValue);
  }

  // Add new item
  async addItem() {
    const startTime = performance.now();
    const { keyInput, valueInput } = this.domCache;

    const key = keyInput.value.trim();
    const value = valueInput.value.trim();

    if (!key || !value) {
      logger.warn('Attempted to add item with empty key or value');
      this.showCustomFeedback('Please fill in both key and value', '#f59e0b');
      return;
    }

    // Check for duplicate keys
    const duplicateIndex = this.items.findIndex(item => item.key === key);
    if (duplicateIndex !== -1) {
      logger.warn('Attempted to add duplicate key', { key });
      this.showCustomFeedback(`Key "${key}" already exists`, '#f59e0b');
      return;
    }

    const newItem = {
      id: Date.now().toString(),
      key,
      value,
      createdAt: new Date().toISOString()
    };

    try {
      this.items.unshift(newItem);
      logger.info('Item added', { key, valueLength: value.length });

      await this.storageManager.saveItems(this.items);

      // Check storage quota and show warning if needed
      const quotaInfo = await this.storageManager.checkStorageQuota();
      if (quotaInfo.warning) {
        this.showCustomFeedback(quotaInfo.message, '#f59e0b');
      }

      this.forceRerender = true;
      this.renderItems();

      keyInput.value = '';
      valueInput.value = '';
      keyInput.focus();
      this.validateInput();

      const addTime = performance.now() - startTime;
      logger.performance('Add item', addTime, { totalItems: this.items.length });

      if (!quotaInfo.warning) {
        this.showCustomFeedback('Item added successfully!', '#059669');
      }

    } catch (error) {
      logger.error('Failed to add item', error);
      this.showCustomFeedback('Failed to add item. Please try again.', '#dc2626');
      this.items.shift();
    }
  }

  // Copy to clipboard
  async copyToClipboard(text) {
    const startTime = performance.now();

    try {
      logger.debug('Copying to clipboard', { length: text.length });
      await navigator.clipboard.writeText(text);
      this.showCopyFeedback();

      const copyTime = performance.now() - startTime;
      logger.performance('Copy to clipboard', copyTime);

    } catch (error) {
      logger.warn('Modern clipboard API failed, using fallback', error);

      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);

        if (successful) {
          this.showCopyFeedback();
          logger.debug('Fallback copy successful');
        } else {
          throw new Error('Fallback copy failed');
        }

      } catch (fallbackError) {
        logger.error('Both clipboard methods failed', fallbackError);
        this.showCustomFeedback('Copy failed. Please try manually.', '#dc2626');
      }
    }
  }

  // Show copy success feedback
  showCopyFeedback() {
    this.showCustomFeedback('Copied!', '#333');
  }

  // Show custom feedback
  showCustomFeedback(text, backgroundColor = '#333') {
    logger.debug('Showing feedback', { text, backgroundColor });

    const existingFeedback = document.querySelector('.copy-feedback');
    if (existingFeedback) {
      existingFeedback.remove();
    }

    const feedback = document.createElement('div');
    feedback.className = CONSTANTS.CLASSES.COPY_FEEDBACK;
    feedback.textContent = text;
    feedback.style.backgroundColor = backgroundColor;

    const listSection = document.querySelector('.list-section');
    if (listSection) {
      listSection.appendChild(feedback);
    } else {
      document.body.appendChild(feedback);
    }

    const showTimeout = setTimeout(() => {
      feedback.classList.add('show');
    }, 10);

    const hideTimeout = setTimeout(() => {
      feedback.classList.remove('show');
      const removeTimeout = setTimeout(() => {
        if (feedback.parentNode) {
          feedback.parentNode.removeChild(feedback);
        }
      }, 200);
      feedback.removeTimeout = removeTimeout;
    }, CONSTANTS.FEEDBACK_DURATION);

    feedback.showTimeout = showTimeout;
    feedback.hideTimeout = hideTimeout;
  }

  // Edit item
  editItem(index) {
    if (this.editingId !== null) {
      this.cancelEdit();
    }

    this.editingId = index;
    const item = this.items[index];
    const itemElement = document.querySelector(`[data-index="${index}"]`);

    itemElement.classList.add('editing');

    const keyValue = itemElement.querySelector('.item-key');
    const valueValue = itemElement.querySelector('.item-value');
    const separators = itemElement.querySelectorAll('.separator');
    const actions = itemElement.querySelector('.item-actions');

    keyValue.style.display = 'none';
    valueValue.style.display = 'none';
    separators.forEach(sep => sep.style.display = 'none');

    const editContainer = document.createElement('div');
    editContainer.className = 'edit-inputs';
    editContainer.innerHTML = `
      <input type="text" class="edit-input edit-key" value="${this.escapeHtml(item.key)}" placeholder="Key">
      <input type="text" class="edit-input edit-value" value="${this.escapeHtml(item.value)}" placeholder="Value">
    `;

    itemElement.insertBefore(editContainer, actions);

    actions.innerHTML = `
      <button class="action-btn save-btn" title="Save changes">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>
      </button>
      <button class="action-btn cancel-btn" title="Cancel editing">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    `;

    const saveBtn = actions.querySelector('.save-btn');
    const cancelBtn = actions.querySelector('.cancel-btn');

    if (saveBtn) {
      saveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.saveEdit(index);
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.cancelEdit();
      });
    }

    const keyInputEdit = editContainer.querySelector('.edit-key');
    keyInputEdit.focus();
    keyInputEdit.select();

    const inputs = editContainer.querySelectorAll('.edit-input');
    inputs.forEach((input, inputIndex) => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          if (inputIndex < inputs.length - 1) {
            inputs[inputIndex + 1].focus();
          } else {
            this.saveEdit(index);
          }
        } else if (e.key === 'Escape') {
          this.cancelEdit();
        }
      });
    });
  }

  // Save edit
  async saveEdit(index) {
    logger.debug('saveEdit called', { index });
    const itemElement = document.querySelector(`[data-index="${index}"]`);
    const keyInput = itemElement.querySelector('.edit-key');
    const valueInput = itemElement.querySelector('.edit-value');

    if (!keyInput || !valueInput) {
      logger.error('Edit inputs not found', { index });
      return;
    }

    const newKey = keyInput.value.trim();
    const newValue = valueInput.value.trim();

    if (!newKey || !newValue) {
      logger.warn('Empty key or value in edit', { newKey, newValue });
      return;
    }

    this.items[index].key = newKey;
    this.items[index].value = newValue;

    await this.storageManager.saveItems(this.items);
    this.editingId = null;
    this.forceRerender = true;
    this.renderItems();
    logger.debug('Edit saved successfully', { index });
  }

  // Cancel edit
  cancelEdit() {
    logger.debug('cancelEdit called', { editingId: this.editingId });
    if (this.editingId !== null) {
      this.editingId = null;
      this.forceRerender = true;
      this.renderItems();
      logger.debug('Edit cancelled successfully');
    }
  }

  // Show delete confirmation
  deleteItem(index) {
    const item = this.items[index];
    const keyName = item ? item.key : 'this item';
    const itemElement = document.querySelector(`[data-index="${index}"]`);

    const keyEl = itemElement.querySelector('.item-key');
    const valueEl = itemElement.querySelector('.item-value');
    const separators = itemElement.querySelectorAll('.separator');
    const actions = itemElement.querySelector('.item-actions');

    keyEl.style.display = 'none';
    valueEl.style.display = 'none';
    separators.forEach(sep => sep.style.display = 'none');

    const confirmContainer = document.createElement('div');
    confirmContainer.className = 'delete-confirm';
    confirmContainer.innerHTML = `
      <div class="delete-confirm-text">Delete "${this.escapeHtml(keyName)}"?</div>
      <div class="delete-confirm-actions">
        <button class="confirm-btn confirm-yes" title="Yes, delete">Yes</button>
        <button class="confirm-btn confirm-no" title="No, cancel">No</button>
      </div>
    `;

    itemElement.insertBefore(confirmContainer, actions);
    actions.style.display = 'none';
  }

  // Confirm delete
  async confirmDelete(index) {
    this.items.splice(index, 1);
    await this.storageManager.saveItems(this.items);
    this.renderItems();
  }

  // Cancel delete
  cancelDelete(index) {
    const itemElement = document.querySelector(`[data-index="${index}"]`);
    const confirmContainer = itemElement.querySelector('.delete-confirm');
    const keyEl = itemElement.querySelector('.item-key');
    const valueEl = itemElement.querySelector('.item-value');
    const separators = itemElement.querySelectorAll('.separator');
    const actions = itemElement.querySelector('.item-actions');

    if (confirmContainer) {
      confirmContainer.remove();
    }

    keyEl.style.display = '';
    valueEl.style.display = '';
    separators.forEach(sep => sep.style.display = '');
    actions.style.display = '';
  }

  // Show clear all confirmation
  showClearAllConfirm() {
    const count = this.items.length;
    if (count === 0) {
      this.showCustomFeedback('No records to clear', '#f59e0b');
      return;
    }

    const clearAllBtn = document.getElementById('clearAllBtn');

    clearAllBtn.innerHTML = `
      <span style="font-size: 9px; display: flex; gap: 2px; align-items: center; width: 100%; justify-content: center;">
        <button class="confirm-clear-yes" style="background: #dc2626; border: none; color: white; padding: 2px 4px; border-radius: 3px; font-size: 10px; cursor: pointer; flex: 1; font-weight: 600;">Y</button>
        <button class="confirm-clear-no" style="background: #059669; border: none; color: white; padding: 2px 4px; border-radius: 3px; font-size: 10px; cursor: pointer; flex: 1; font-weight: 600;">N</button>
      </span>
    `;

    clearAllBtn.style.background = 'rgba(245, 158, 11, 0.1)';
    clearAllBtn.style.borderColor = '#f59e0b';
    clearAllBtn.style.color = '#f59e0b';
    clearAllBtn.title = `Clear ${count} records?`;

    const yesBtn = clearAllBtn.querySelector('.confirm-clear-yes');
    const noBtn = clearAllBtn.querySelector('.confirm-clear-no');

    yesBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.confirmClearAll();
    });

    noBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cancelClearAll();
    });

    this.clearAllTimeout = setTimeout(() => {
      this.cancelClearAll();
    }, CONSTANTS.CLEAR_TIMEOUT);
  }

  // Confirm clear all
  async confirmClearAll() {
    if (this.clearAllTimeout) {
      clearTimeout(this.clearAllTimeout);
    }

    this.items = [];
    await this.storageManager.saveItems(this.items);
    this.renderItems();
    this.resetClearAllButton();
    this.showCustomFeedback('All records cleared', '#059669');
  }

  // Cancel clear all
  cancelClearAll() {
    if (this.clearAllTimeout) {
      clearTimeout(this.clearAllTimeout);
    }
    this.resetClearAllButton();
  }

  // Reset clear all button
  resetClearAllButton() {
    const clearAllBtn = document.getElementById('clearAllBtn');
    clearAllBtn.innerHTML = `
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 14px; height: 14px;">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
      </svg>
      Clear
    `;
    clearAllBtn.style.background = '';
    clearAllBtn.style.borderColor = '';
    clearAllBtn.style.color = '';
    clearAllBtn.title = 'Clear all records';
    this.updateClearAllButton();
  }

  // Update clear all button state
  updateClearAllButton() {
    const { clearAllBtn } = this.domCache;
    const count = this.items.length;

    if (count === 0) {
      clearAllBtn.disabled = true;
      clearAllBtn.title = 'No records to clear';
    } else {
      clearAllBtn.disabled = false;
      clearAllBtn.title = `Clear all ${count} records`;
    }
  }

  // Toggle value visibility
  toggleValueVisibility() {
    this.valuesVisible = !this.valuesVisible;
    logger.debug('Toggling value visibility', { visible: this.valuesVisible });

    this.updateVisibilityButton();
    this.updateValueVisibility();
  }

  // Update visibility button state
  updateVisibilityButton() {
    const { toggleVisibilityBtn } = this.domCache;
    const count = this.items.length;

    if (count === 0) {
      toggleVisibilityBtn.disabled = true;
      toggleVisibilityBtn.title = 'No items to toggle';
    } else {
      toggleVisibilityBtn.disabled = false;
      toggleVisibilityBtn.title = this.valuesVisible ? 'Hide values' : 'Show values';
    }

    const eyeOpen = toggleVisibilityBtn.querySelector('.eye-open');
    const eyeClosed = toggleVisibilityBtn.querySelector('.eye-closed');

    if (this.valuesVisible) {
      eyeOpen.style.display = 'block';
      eyeClosed.style.display = 'none';
    } else {
      eyeOpen.style.display = 'none';
      eyeClosed.style.display = 'block';
    }
  }

  // Update value visibility in DOM
  updateValueVisibility() {
    const valueElements = document.querySelectorAll('.item-value');

    valueElements.forEach((element) => {
      if (this.valuesVisible) {
        element.classList.remove('hidden');
        const originalText = element.dataset.originalText;
        if (originalText) {
          element.textContent = originalText;
        }
      } else {
        element.classList.add('hidden');
        element.dataset.originalText = element.textContent;
        element.textContent = '...';
      }
    });
  }

  // Cleanup method
  cleanup() {
    logger.info('Cleaning up AkoStore resources');

    this.isDestroyed = true;

    if (this.abortController) {
      this.abortController.abort();
      logger.debug('Aborted all document-level event listeners');
    }

    if (this.clearAllTimeout) {
      clearTimeout(this.clearAllTimeout);
      this.clearAllTimeout = null;
    }

    const feedbackElements = document.querySelectorAll(`.${CONSTANTS.CLASSES.COPY_FEEDBACK}`);
    feedbackElements.forEach(element => {
      if (element.showTimeout) clearTimeout(element.showTimeout);
      if (element.hideTimeout) clearTimeout(element.hideTimeout);
      if (element.removeTimeout) clearTimeout(element.removeTimeout);
      element.remove();
    });

    this.dragDropHandler.cleanup();
    this.domCache = {};

    logger.info('Cleanup completed');
  }

  // Render items list
  renderItems() {
    const startTime = performance.now();
    const { itemsList, itemCount } = this.domCache;

    const count = this.items.length;

    logger.debug('Render items called', {
      count,
      lastRenderItems: this.performanceMetrics.lastRenderItems,
      forceRerender: this.forceRerender,
      editingId: this.editingId
    });

    if (count === this.performanceMetrics.lastRenderItems &&
        itemsList.children.length > 0 &&
        !this.forceRerender) {
      logger.debug('Skipping render - no changes detected');
      return;
    }

    itemCount.textContent = count;

    if (count === 0) {
      itemsList.innerHTML = '<div class="empty-message">No items yet. Add your first key-value pair above.</div>';
      this.updateClearAllButton();
      this.performanceMetrics.lastRenderItems = 0;
      return;
    }

    const fragment = document.createDocumentFragment();

    this.items.forEach((item, index) => {
      const itemElement = this.createItemElement(item, index);
      fragment.appendChild(itemElement);
    });

    itemsList.innerHTML = '';
    itemsList.appendChild(fragment);

    this.updateClearAllButton();
    this.updateVisibilityButton();
    this.forceRerender = false;
    this.performanceMetrics.lastRenderItems = count;

    if (!this.valuesVisible && count > 0) {
      setTimeout(() => this.updateValueVisibility(), 10);
    }

    const renderTime = performance.now() - startTime;
    this.performanceMetrics.renderTime = renderTime;
    logger.performance('Render items', renderTime, { itemCount: count });
  }

  // Create individual item element
  createItemElement(item, index) {
    const div = document.createElement('div');
    div.className = 'item';
    div.dataset.index = index;
    div.dataset.originalIndex = index;

    div.innerHTML = `
      <div class="drag-handle" title="Drag to reorder">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"/>
        </svg>
      </div>
      <div class="item-key" title="${this.escapeHtml(item.key)}">${this.escapeHtml(item.key)}</div>
      <div class="separator">|</div>
      <div class="item-value" title="${this.escapeHtml(item.value)}">${this.escapeHtml(item.value)}</div>
      <div class="separator">|</div>
      <div class="item-actions">
        <button class="action-btn copy-btn" title="Copy value">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
          </svg>
        </button>
        <button class="action-btn edit-btn" title="Edit">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
          </svg>
        </button>
        <button class="action-btn delete-btn" title="Delete">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>
      </div>
    `;

    return div;
  }

  // Escape HTML
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
