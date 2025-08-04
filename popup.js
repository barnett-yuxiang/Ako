// Constants
const CONSTANTS = {
  STORAGE_KEY: 'akoItems',
  DRAG_THRESHOLD: 5,
  FEEDBACK_DURATION: 2000,
  CLEAR_TIMEOUT: 5000,
  SELECTORS: {
    KEY_INPUT: '#keyInput',
    VALUE_INPUT: '#valueInput',
    ADD_BTN: '#addBtn',
    CLEAR_ALL_BTN: '#clearAllBtn',
    TOGGLE_VISIBILITY_BTN: '#toggleVisibilityBtn',
    ITEMS_LIST: '#itemsList',
    ITEM_COUNT: '#itemCount'
  },
  CLASSES: {
    DRAGGING: 'dragging',
    EDITING: 'editing',
    DROP_INDICATOR: 'drop-indicator',
    COPY_FEEDBACK: 'copy-feedback'
  }
};

// Logger class for debugging and monitoring
class AkoLogger {
  constructor() {
    this.enabled = true; // Set to false in production
    this.logLevel = 'info'; // 'debug', 'info', 'warn', 'error'
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

class AkoStore {
    constructor() {
    // Data
    this.items = []; // Changed from object to array
    this.editingId = null;
    this.valuesVisible = false; // Track value visibility state - default hidden

    // Drag state
    this.draggedElement = null;
    this.draggedIndex = null;
    this.isDragging = false;
    this.mouseDownY = null;
    this.mouseDownX = null;
    this.dragThreshold = 5;
    this.dragOffset = { x: 0, y: 0 };

    // DOM element cache
    this.domCache = {};

    // Performance monitoring
    this.performanceMetrics = {
      loadTime: 0,
      renderTime: 0,
      lastRenderItems: 0
    };

    // Logger
    this.logger = new AkoLogger();

    // AbortController for proper event cleanup
    this.abortController = new AbortController();
    this.signal = this.abortController.signal;

    // Lifecycle state
    this.isDestroyed = false;

    this.init();
  }

  // Utility: Debounce function for performance optimization
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
        this.logger.error(`DOM element not found: ${key}`);
      }
    }
  }

  async init() {
    const startTime = performance.now();
    this.logger.info('Initializing AkoStore');

    try {
      this.initDOMCache();
      await this.loadItems();
      this.setupEventListeners();
      this.renderItems();
      this.validateInput(); // Set initial button state
      this.updateClearAllButton(); // Set initial clear button state
      this.updateVisibilityButton(); // Set initial visibility button state

      const initTime = performance.now() - startTime;
      this.performanceMetrics.loadTime = initTime;
      this.logger.performance('Initialization', initTime, { itemCount: this.items.length });
      this.logger.info('AkoStore initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize AkoStore', error);
      throw error;
    }
  }

  // Load data from chrome.storage.local with migration support
  async loadItems() {
    const startTime = performance.now();

    try {
      this.logger.debug('Loading items from storage');
      const result = await chrome.storage.local.get([CONSTANTS.STORAGE_KEY]);
      const data = result[CONSTANTS.STORAGE_KEY] || {};

      // Migration: convert old object format to array format
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        this.logger.info('Migrating data from object to array format', { oldCount: Object.keys(data).length });
        // Old format: {id1: {id, key, value, createdAt}, id2: {...}}
        this.items = Object.values(data).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        // Save in new format
        await this.saveItems();
        this.logger.info('Data migration completed', { newCount: this.items.length });
      } else if (Array.isArray(data)) {
        // New format: already an array
        this.items = data;
        this.logger.debug('Loaded items in array format', { count: this.items.length });
      } else {
        // Empty/invalid data
        this.items = [];
        this.logger.debug('No existing data found, initialized empty array');
      }

      const loadTime = performance.now() - startTime;
      this.logger.performance('Data loading', loadTime, { itemCount: this.items.length });

    } catch (error) {
      this.logger.error('Failed to load items from storage', error);
      this.items = [];

      // Try to recover from backup if available
      this.logger.warn('Attempting to recover from data corruption');
    }
  }

  // Save data to chrome.storage.local (always save as array)
  async saveItems() {
    const startTime = performance.now();

    try {
      this.logger.debug('Saving items to storage', { count: this.items.length });
      await chrome.storage.local.set({ [CONSTANTS.STORAGE_KEY]: this.items });

      const saveTime = performance.now() - startTime;
      this.logger.performance('Data saving', saveTime, { itemCount: this.items.length });

    } catch (error) {
      this.logger.error('Failed to save items to storage', error);
      this.showCustomFeedback('Save failed! Please try again.', '#dc2626');
      throw error; // Re-throw to let caller handle
    }
  }

  // Setup event listeners
  setupEventListeners() {
    this.logger.debug('Setting up event listeners');

    // Use cached DOM elements
    const { keyInput, valueInput, addBtn, clearAllBtn, toggleVisibilityBtn, itemsList } = this.domCache;

    // Add button click event
    addBtn.addEventListener('click', () => this.addItem());

    // Clear all button click event
    clearAllBtn.addEventListener('click', () => this.showClearAllConfirm());

    // Toggle visibility button click event
    toggleVisibilityBtn.addEventListener('click', () => this.toggleValueVisibility());

    // Enter key handling with improved UX
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

    // Input validation with debouncing for better performance
    const validateDebounced = this.debounce(() => this.validateInput(), 100);
    keyInput.addEventListener('input', validateDebounced);
    valueInput.addEventListener('input', validateDebounced);

        // Event delegation for dynamic buttons with performance optimization
    itemsList.addEventListener('click', (e) => this.handleItemClick(e));

    // Mouse-based drag and drop event listeners
    itemsList.addEventListener('mousedown', (e) => this.handleMouseDown(e));

    // Document-level events with AbortController for proper cleanup
    document.addEventListener('mousemove', (e) => this.handleMouseMove(e), {
      signal: this.signal
    });
    document.addEventListener('mouseup', (e) => this.handleMouseUp(e), {
      signal: this.signal
    });

    this.logger.debug('Event listeners setup completed', {
      abortControllerSignal: this.signal.aborted ? 'aborted' : 'active'
    });
  }

    // Optimized item click handler
  handleItemClick(e) {
    // Enhanced debugging for click events
    this.logger.debug('Click detected', {
      target: e.target.tagName,
      targetClasses: Array.from(e.target.classList)
    });

    const button = e.target.closest('button');
    if (!button) {
      this.logger.debug('No button found in click event');
      return;
    }

    const itemElement = button.closest('.item');
    if (!itemElement) {
      this.logger.debug('No item element found for button');
      return;
    }

    const itemIndex = parseInt(itemElement.dataset.index);
    if (isNaN(itemIndex) || itemIndex < 0 || itemIndex >= this.items.length) {
      this.logger.warn('Invalid item index in click handler', { index: itemIndex });
      return;
    }

    // Debug logging for edit buttons
    const buttonClasses = Array.from(button.classList);
    this.logger.debug('Button clicked', {
      index: itemIndex,
      classes: buttonClasses,
      isEditing: itemElement.classList.contains('editing'),
      buttonText: button.textContent.trim(),
      editingId: this.editingId
    });

    // Performance: use a lookup table instead of multiple class checks
    const actionHandlers = {
      'copy-btn': () => {
        const itemValue = this.items[itemIndex]?.value;
        if (itemValue) {
          this.copyToClipboard(itemValue);
          this.logger.debug('Copy action triggered', { index: itemIndex });
        }
      },
      'edit-btn': () => {
        this.editItem(itemIndex);
        this.logger.debug('Edit action triggered', { index: itemIndex });
      },
      'delete-btn': () => {
        this.deleteItem(itemIndex);
        this.logger.debug('Delete action triggered', { index: itemIndex });
      },
      'save-btn': () => {
        this.saveEdit(itemIndex);
        this.logger.debug('Save edit action triggered', { index: itemIndex });
      },
      'cancel-btn': () => {
        this.cancelEdit();
        this.logger.debug('Cancel edit action triggered');
      },
      'confirm-yes': () => {
        this.confirmDelete(itemIndex);
        this.logger.debug('Confirm delete action triggered', { index: itemIndex });
      },
      'confirm-no': () => {
        this.cancelDelete(itemIndex);
        this.logger.debug('Cancel delete action triggered', { index: itemIndex });
      }
    };

    // Find and execute the appropriate handler
    let handlerFound = false;
    for (const [className, handler] of Object.entries(actionHandlers)) {
      if (button.classList.contains(className)) {
        this.logger.debug('Executing handler', { className, index: itemIndex });
        handler();
        handlerFound = true;
        break;
      }
    }

    if (!handlerFound) {
      this.logger.warn('No handler found for button', {
        classes: Array.from(button.classList),
        index: itemIndex
      });
    }
  }

  // Mouse down handler - start drag
  handleMouseDown(e) {
    // Only handle drag from drag handle
    const dragHandle = e.target.closest('.drag-handle');
    if (!dragHandle) return;

    const item = dragHandle.closest('.item');
    if (!item) return;

    // Prevent default to avoid text selection
    e.preventDefault();

    this.isDragging = false; // Not dragging yet, just mouse down
    this.draggedElement = item;
    this.draggedIndex = parseInt(item.dataset.index);
    this.mouseDownY = e.clientY;
    this.mouseDownX = e.clientX;

    // Calculate drag offset relative to element
    const rect = item.getBoundingClientRect();
    this.dragOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };

    if (isNaN(this.draggedIndex) || this.draggedIndex < 0 || this.draggedIndex >= this.items.length) {
      this.logger.warn('Invalid drag index', { index: this.draggedIndex });
      return;
    }

    this.logger.debug('Mouse down on drag handle', {
      index: this.draggedIndex,
      key: this.items[this.draggedIndex]?.key
    });
  }

      // Mouse move handler - track drag
  handleMouseMove(e) {
    // ✅ Lifecycle check: Prevent operations on destroyed instance
    if (this.isDestroyed || !this.draggedElement) return;

    // Check if we should start dragging
    if (!this.isDragging) {
      const deltaY = Math.abs(e.clientY - this.mouseDownY);
      if (deltaY < CONSTANTS.DRAG_THRESHOLD) return;

      // Start dragging
      this.isDragging = true;
      this.draggedElement.classList.add(CONSTANTS.CLASSES.DRAGGING);
      this.domCache.itemsList.classList.add(CONSTANTS.CLASSES.DRAGGING);
      document.body.style.userSelect = 'none'; // Prevent text selection

      this.logger.info('Drag started', {
        index: this.draggedIndex,
        key: this.items[this.draggedIndex]?.key
      });
    }

    // Update dragged element position to follow mouse
    this.updateDraggedElementPosition(e.clientX, e.clientY);

    // Provide visual feedback
    this.updateDropIndicator(e.clientY);
  }

  // Update dragged element position to follow mouse
  updateDraggedElementPosition(mouseX, mouseY) {
    if (!this.draggedElement || !this.isDragging) return;

    // Position element to follow mouse cursor
    const x = mouseX - this.dragOffset.x;
    const y = mouseY - this.dragOffset.y;

    this.draggedElement.style.left = `${x}px`;
    this.draggedElement.style.top = `${y}px`;
  }

  // Update drop indicator based on mouse position
  updateDropIndicator(mouseY) {
    const itemsList = document.getElementById('itemsList');
    const afterElement = this.getDragAfterElement(itemsList, mouseY);

    // Remove previous drop indicators
    document.querySelectorAll('.drop-indicator').forEach(el => el.classList.remove('drop-indicator'));

    // Add drop indicator
    if (afterElement == null) {
      // Will be inserted at the end
      const lastItem = itemsList.querySelector('.item:last-child');
      if (lastItem && lastItem !== this.draggedElement) {
        lastItem.classList.add('drop-indicator');
      }
    } else if (afterElement !== this.draggedElement) {
      afterElement.classList.add('drop-indicator');
    }
  }

  // Get element after drag position
  getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.item:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;

      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

    // Mouse up handler - complete drag
  async handleMouseUp(e) {
    // ✅ Lifecycle check: Prevent operations on destroyed instance
    if (this.isDestroyed || !this.draggedElement) return;

    if (this.isDragging) {
      // Complete the drag operation
      await this.completeDrag(e.clientY);
      this.logger.info('Drag ended', {
      movedFrom: this.draggedIndex,
      itemKey: this.items[this.draggedIndex]?.key
    });
    }

    // Clean up
    this.cleanupDragState();
  }

  // Complete drag operation
  async completeDrag(mouseY) {
    if (!this.draggedElement || this.draggedIndex === null) return;

    const itemsList = document.getElementById('itemsList');
    const afterElement = this.getDragAfterElement(itemsList, mouseY);

    let newIndex;
    if (afterElement == null) {
      // Drop at the end
      newIndex = this.items.length - 1;
    } else {
      // Drop before afterElement
      newIndex = parseInt(afterElement.dataset.index);
      // If dragging from earlier position to later, adjust index
      if (this.draggedIndex < newIndex) {
        newIndex--;
      }
    }

    // Only update data if position changed
    if (newIndex !== this.draggedIndex && newIndex >= 0) {
      const startTime = performance.now();
      const movedItem = this.items.splice(this.draggedIndex, 1)[0];
      this.items.splice(newIndex, 0, movedItem);

      this.logger.info('Item reordered', {
        key: movedItem.key,
        from: this.draggedIndex,
        to: newIndex
      });

      // Save and re-render to ensure consistency
      await this.saveItems();
      this.forceRerender = true;
      this.renderItems();

      const dragTime = performance.now() - startTime;
      this.logger.performance('Drag operation', dragTime, {
        itemCount: this.items.length,
        moved: `${this.draggedIndex}→${newIndex}`
      });
    }
  }

  // Clean up drag state
  cleanupDragState() {
    // Remove dragging classes
    const itemsList = document.getElementById('itemsList');
    itemsList.classList.remove('dragging');

    if (this.draggedElement) {
      this.draggedElement.classList.remove('dragging');
      // Reset position styles
      this.draggedElement.style.left = '';
      this.draggedElement.style.top = '';
    }

    // Remove all drop indicators
    document.querySelectorAll('.drop-indicator').forEach(el => el.classList.remove('drop-indicator'));

    // Restore text selection
    document.body.style.userSelect = '';

    // Reset drag variables
    this.draggedElement = null;
    this.draggedIndex = null;
    this.isDragging = false;
    this.mouseDownY = null;
    this.mouseDownX = null;
    this.dragOffset = { x: 0, y: 0 };
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
      this.logger.warn('Attempted to add item with empty key or value');
      this.showCustomFeedback('Please fill in both key and value', '#f59e0b');
      return;
    }

    // Check for duplicate keys
    const duplicateIndex = this.items.findIndex(item => item.key === key);
    if (duplicateIndex !== -1) {
      this.logger.warn('Attempted to add duplicate key', { key });
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
      // Add to beginning of array (newest first)
      this.items.unshift(newItem);
      this.logger.info('Item added', { key, valueLength: value.length });

      await this.saveItems();
      this.forceRerender = true;
      this.renderItems();

      // Clear input fields
      keyInput.value = '';
      valueInput.value = '';
      keyInput.focus();

      // Update button state after clearing inputs
      this.validateInput();

      const addTime = performance.now() - startTime;
      this.logger.performance('Add item', addTime, { totalItems: this.items.length });

      this.showCustomFeedback('Item added successfully!', '#059669');

    } catch (error) {
      this.logger.error('Failed to add item', error);
      this.showCustomFeedback('Failed to add item. Please try again.', '#dc2626');
      // Remove the item that was added but failed to save
      this.items.shift();
    }
  }

  // Copy to clipboard with enhanced error handling
  async copyToClipboard(text) {
    const startTime = performance.now();

    try {
      this.logger.debug('Copying to clipboard', { length: text.length });
      await navigator.clipboard.writeText(text);
      this.showCopyFeedback();

      const copyTime = performance.now() - startTime;
      this.logger.performance('Copy to clipboard', copyTime);

    } catch (error) {
      this.logger.warn('Modern clipboard API failed, using fallback', error);

      try {
        // Fallback method for older browsers
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
          this.logger.debug('Fallback copy successful');
        } else {
          throw new Error('Fallback copy failed');
        }

      } catch (fallbackError) {
        this.logger.error('Both clipboard methods failed', fallbackError);
        this.showCustomFeedback('Copy failed. Please try manually.', '#dc2626');
      }
    }
  }

  // Show copy success feedback
  showCopyFeedback() {
    this.showCustomFeedback('Copied!', '#333');
  }

  // Show custom feedback with text and color
  showCustomFeedback(text, backgroundColor = '#333') {
    this.logger.debug('Showing feedback', { text, backgroundColor });

    // Clean up any existing feedback to prevent accumulation
    const existingFeedback = document.querySelector('.copy-feedback');
    if (existingFeedback) {
      existingFeedback.remove();
    }

    const feedback = document.createElement('div');
    feedback.className = CONSTANTS.CLASSES.COPY_FEEDBACK;
    feedback.textContent = text;
    feedback.style.backgroundColor = backgroundColor;

    // Append to list-section for proper positioning
    const listSection = document.querySelector('.list-section');
    if (listSection) {
      listSection.appendChild(feedback);
    } else {
      document.body.appendChild(feedback); // Fallback
    }

    // Show animation
    const showTimeout = setTimeout(() => {
      feedback.classList.add('show');
    }, 10);

    // Remove after duration
    const hideTimeout = setTimeout(() => {
      feedback.classList.remove('show');
      const removeTimeout = setTimeout(() => {
        if (feedback.parentNode) {
          feedback.parentNode.removeChild(feedback);
        }
      }, 200);

      // Store timeout reference for cleanup
      feedback.removeTimeout = removeTimeout;
    }, CONSTANTS.FEEDBACK_DURATION);

    // Store timeout references for potential cleanup
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

    // Replace content with edit inputs
    const keyValue = itemElement.querySelector('.item-key');
    const valueValue = itemElement.querySelector('.item-value');
    const separators = itemElement.querySelectorAll('.separator');
    const actions = itemElement.querySelector('.item-actions');

    keyValue.style.display = 'none';
    valueValue.style.display = 'none';
    separators.forEach(sep => sep.style.display = 'none');

    // Create edit input container
    const editContainer = document.createElement('div');
    editContainer.className = 'edit-inputs';
    editContainer.innerHTML = `
      <input type="text" class="edit-input edit-key" value="${this.escapeHtml(item.key)}" placeholder="Key">
      <input type="text" class="edit-input edit-value" value="${this.escapeHtml(item.value)}" placeholder="Value">
    `;

    // Insert edit container
    itemElement.insertBefore(editContainer, actions);

    // Update action buttons
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

    // Add direct event listeners to ensure they work
    const saveBtn = actions.querySelector('.save-btn');
    const cancelBtn = actions.querySelector('.cancel-btn');

    if (saveBtn) {
      saveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.logger.debug('Direct save button clicked', { index });
        this.saveEdit(index);
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.logger.debug('Direct cancel button clicked');
        this.cancelEdit();
      });
    }

    // Focus on key input
    const keyInputEdit = editContainer.querySelector('.edit-key');
    keyInputEdit.focus();
    keyInputEdit.select();

    // Add Enter key save functionality
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
    this.logger.debug('saveEdit called', { index });
    const itemElement = document.querySelector(`[data-index="${index}"]`);
    const keyInput = itemElement.querySelector('.edit-key');
    const valueInput = itemElement.querySelector('.edit-value');

    if (!keyInput || !valueInput) {
      this.logger.error('Edit inputs not found', { index });
      return;
    }

    const newKey = keyInput.value.trim();
    const newValue = valueInput.value.trim();

    if (!newKey || !newValue) {
      this.logger.warn('Empty key or value in edit', { newKey, newValue });
      return;
    }

    this.items[index].key = newKey;
    this.items[index].value = newValue;

    await this.saveItems();
    this.editingId = null;
    this.forceRerender = true; // Force re-render to exit editing state
    this.renderItems();
    this.logger.debug('Edit saved successfully', { index });
  }

  // Cancel edit
  cancelEdit() {
    this.logger.debug('cancelEdit called', { editingId: this.editingId });
    if (this.editingId !== null) {
      this.editingId = null;
      this.forceRerender = true; // Force re-render to exit editing state
      this.renderItems();
      this.logger.debug('Edit cancelled successfully');
    }
  }

  // Show delete confirmation
  deleteItem(index) {
    const item = this.items[index];
    const keyName = item ? item.key : 'this item';
    const itemElement = document.querySelector(`[data-index="${index}"]`);

    // Hide the normal content
    const keyEl = itemElement.querySelector('.item-key');
    const valueEl = itemElement.querySelector('.item-value');
    const separators = itemElement.querySelectorAll('.separator');
    const actions = itemElement.querySelector('.item-actions');

    keyEl.style.display = 'none';
    valueEl.style.display = 'none';
    separators.forEach(sep => sep.style.display = 'none');

    // Create confirmation interface
    const confirmContainer = document.createElement('div');
    confirmContainer.className = 'delete-confirm';
    confirmContainer.innerHTML = `
      <div class="delete-confirm-text">Delete "${this.escapeHtml(keyName)}"?</div>
      <div class="delete-confirm-actions">
        <button class="confirm-btn confirm-yes" title="Yes, delete">Yes</button>
        <button class="confirm-btn confirm-no" title="No, cancel">No</button>
      </div>
    `;

    // Insert confirmation before actions and hide actions
    itemElement.insertBefore(confirmContainer, actions);
    actions.style.display = 'none';
  }

  // Confirm delete
  async confirmDelete(index) {
    this.items.splice(index, 1);
    await this.saveItems();
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

    // Remove confirmation interface
    if (confirmContainer) {
      confirmContainer.remove();
    }

    // Restore normal content
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

    // Replace button with confirmation
    clearAllBtn.innerHTML = `
      <span style="font-size: 9px; display: flex; gap: 2px; align-items: center; width: 100%; justify-content: center;">
        <button class="confirm-clear-yes" style="background: #dc2626; border: none; color: white; padding: 2px 4px; border-radius: 3px; font-size: 8px; cursor: pointer; flex: 1;">Yes</button>
        <button class="confirm-clear-no" style="background: #059669; border: none; color: white; padding: 2px 4px; border-radius: 3px; font-size: 8px; cursor: pointer; flex: 1;">No</button>
      </span>
    `;
    // Modern confirmation style
    clearAllBtn.style.background = 'rgba(245, 158, 11, 0.1)';
    clearAllBtn.style.borderColor = '#f59e0b';
    clearAllBtn.style.color = '#f59e0b';
    clearAllBtn.title = `Clear ${count} records?`;

    // Add event listeners for the confirmation buttons
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

    // Auto-cancel after 5 seconds
    this.clearAllTimeout = setTimeout(() => {
      this.cancelClearAll();
    }, 5000);
  }

  // Confirm clear all
  async confirmClearAll() {
    if (this.clearAllTimeout) {
      clearTimeout(this.clearAllTimeout);
    }

    this.items = [];
    await this.saveItems();
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
    // Restore original content with icon
    clearAllBtn.innerHTML = `
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 14px; height: 14px;">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
      </svg>
      Clear
    `;
    // Reset to modern outline style
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
    this.logger.debug('Toggling value visibility', { visible: this.valuesVisible });

    this.updateVisibilityButton();
    this.updateValueVisibility();
  }

  // Update visibility button state
  updateVisibilityButton() {
    const { toggleVisibilityBtn } = this.domCache;
    const count = this.items.length;

    // Update button disabled state
    if (count === 0) {
      toggleVisibilityBtn.disabled = true;
      toggleVisibilityBtn.title = 'No items to toggle';
    } else {
      toggleVisibilityBtn.disabled = false;
      toggleVisibilityBtn.title = this.valuesVisible ? 'Hide values' : 'Show values';
    }

    // Update eye icon
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
        // Restore original text
        const originalText = element.dataset.originalText;
        if (originalText) {
          element.textContent = originalText;
        }
      } else {
        element.classList.add('hidden');
        // Store original text and replace with fixed three dots
        element.dataset.originalText = element.textContent;
        element.textContent = '...';
      }
    });
  }

    // Cleanup method for proper resource management
  cleanup() {
    this.logger.info('Cleaning up AkoStore resources');

    // Mark as destroyed to prevent further operations
    this.isDestroyed = true;

    // ✅ Primary fix: Abort all document-level event listeners
    if (this.abortController) {
      this.abortController.abort();
      this.logger.debug('Aborted all document-level event listeners');
    }

    // Clear any pending timeouts
    if (this.clearAllTimeout) {
      clearTimeout(this.clearAllTimeout);
      this.clearAllTimeout = null;
    }

    // Clean up feedback elements
    const feedbackElements = document.querySelectorAll(`.${CONSTANTS.CLASSES.COPY_FEEDBACK}`);
    feedbackElements.forEach(element => {
      if (element.showTimeout) clearTimeout(element.showTimeout);
      if (element.hideTimeout) clearTimeout(element.hideTimeout);
      if (element.removeTimeout) clearTimeout(element.removeTimeout);
      element.remove();
    });

    // Reset drag state
    this.cleanupDragState();

    // Clear DOM cache
    this.domCache = {};

    this.logger.info('Cleanup completed', {
      abortControllerAborted: this.abortController?.signal.aborted
    });
  }

  // Render items list with performance optimization
  renderItems() {
    const startTime = performance.now();
    const { itemsList, itemCount } = this.domCache;

    const count = this.items.length;

    this.logger.debug('Render items called', {
      count,
      lastRenderItems: this.performanceMetrics.lastRenderItems,
      forceRerender: this.forceRerender,
      editingId: this.editingId
    });

    // Performance: avoid unnecessary re-renders
    if (count === this.performanceMetrics.lastRenderItems &&
        itemsList.children.length > 0 &&
        !this.forceRerender) {
      this.logger.debug('Skipping render - no changes detected');
      return;
    }

    itemCount.textContent = count;

    if (count === 0) {
      itemsList.innerHTML = '<div class="empty-message">No items yet. Add your first key-value pair above.</div>';
      this.updateClearAllButton();
      this.performanceMetrics.lastRenderItems = 0;
      return;
    }

    // Performance: use DocumentFragment for efficient DOM manipulation
    const fragment = document.createDocumentFragment();

    this.items.forEach((item, index) => {
      const itemElement = this.createItemElement(item, index);
      fragment.appendChild(itemElement);
    });

    // Clear and append all at once
    itemsList.innerHTML = '';
    itemsList.appendChild(fragment);

    this.updateClearAllButton();
    this.updateVisibilityButton();
    this.forceRerender = false;
    this.performanceMetrics.lastRenderItems = count;

    // Apply current visibility state to newly rendered items (default hidden)
    if (!this.valuesVisible && count > 0) {
      setTimeout(() => this.updateValueVisibility(), 10);
    }

    const renderTime = performance.now() - startTime;
    this.performanceMetrics.renderTime = renderTime;
    this.logger.performance('Render items', renderTime, { itemCount: count });
  }

  // Create individual item element for better performance
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

// Initialize application
const akoStore = new AkoStore();

// Cleanup on page unload to prevent memory leaks
window.addEventListener('beforeunload', () => {
  if (akoStore && typeof akoStore.cleanup === 'function') {
    akoStore.cleanup();
  }
});

// Handle popup close event (specific to Chrome extensions)
window.addEventListener('unload', () => {
  if (akoStore && typeof akoStore.cleanup === 'function') {
    akoStore.cleanup();
  }
});