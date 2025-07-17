class AkoStore {
  constructor() {
    this.items = []; // Changed from object to array
    this.editingId = null;
    this.draggedElement = null;
    this.draggedIndex = null;
    this.init();
  }

  async init() {
    await this.loadItems();
    this.setupEventListeners();
    this.renderItems();
    this.validateInput(); // Set initial button state
    this.updateClearAllButton(); // Set initial clear button state
  }

  // Load data from chrome.storage.local with migration support
  async loadItems() {
    try {
      const result = await chrome.storage.local.get(['akoItems']);
      const data = result.akoItems || {};

      // Migration: convert old object format to array format
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        // Old format: {id1: {id, key, value, createdAt}, id2: {...}}
        this.items = Object.values(data).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        // Save in new format
        await this.saveItems();
      } else if (Array.isArray(data)) {
        // New format: already an array
        this.items = data;
      } else {
        // Empty/invalid data
        this.items = [];
      }
    } catch (error) {
      console.error('Failed to load items:', error);
      this.items = [];
    }
  }

  // Save data to chrome.storage.local (always save as array)
  async saveItems() {
    try {
      await chrome.storage.local.set({ akoItems: this.items });
    } catch (error) {
      console.error('Failed to save items:', error);
    }
  }

  // Setup event listeners
  setupEventListeners() {
    const keyInput = document.getElementById('keyInput');
    const valueInput = document.getElementById('valueInput');
    const addBtn = document.getElementById('addBtn');
    const clearAllBtn = document.getElementById('clearAllBtn');
    const itemsList = document.getElementById('itemsList');

    // Add button click event
    addBtn.addEventListener('click', () => this.addItem());

    // Clear all button click event
    clearAllBtn.addEventListener('click', () => this.showClearAllConfirm());

    // Enter key handling
    keyInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        valueInput.focus();
      }
    });

    valueInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addItem();
      }
    });

    // Input validation
    keyInput.addEventListener('input', () => this.validateInput());
    valueInput.addEventListener('input', () => this.validateInput());

    // Event delegation for dynamic buttons
    itemsList.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (!button) return;

      const itemElement = button.closest('.item');
      if (!itemElement) return;

      const itemIndex = parseInt(itemElement.dataset.index);
      if (isNaN(itemIndex)) return;

      if (button.classList.contains('copy-btn')) {
        const itemValue = this.items[itemIndex]?.value;
        if (itemValue) this.copyToClipboard(itemValue);
      } else if (button.classList.contains('edit-btn')) {
        this.editItem(itemIndex);
      } else if (button.classList.contains('delete-btn')) {
        this.deleteItem(itemIndex);
      } else if (button.classList.contains('save-btn')) {
        this.saveEdit(itemIndex);
      } else if (button.classList.contains('cancel-btn')) {
        this.cancelEdit();
      } else if (button.classList.contains('confirm-yes')) {
        this.confirmDelete(itemIndex);
      } else if (button.classList.contains('confirm-no')) {
        this.cancelDelete(itemIndex);
      }
    });

    // Mouse-based drag and drop event listeners
    itemsList.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    document.addEventListener('mouseup', (e) => this.handleMouseUp(e));
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
    this.dragThreshold = 5; // Minimum movement to start drag

    console.log('Mouse down on drag handle:', this.draggedIndex, this.items[this.draggedIndex]?.key);
  }

    // Mouse move handler - track drag
  handleMouseMove(e) {
    if (!this.draggedElement) return;

    // Check if we should start dragging
    if (!this.isDragging) {
      const deltaY = Math.abs(e.clientY - this.mouseDownY);
      if (deltaY < this.dragThreshold) return;

      // Start dragging
      this.isDragging = true;
      this.draggedElement.classList.add('dragging');
      document.getElementById('itemsList').classList.add('dragging');
      document.body.style.userSelect = 'none'; // Prevent text selection

      console.log('Drag started:', this.draggedIndex, this.items[this.draggedIndex]?.key);
    }

    // Provide visual feedback
    this.updateDropIndicator(e.clientY);
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
    if (!this.draggedElement) return;

    if (this.isDragging) {
      // Complete the drag operation
      await this.completeDrag(e.clientY);
      console.log('Drag ended');
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

    console.log(`Drag drop: moving "${this.items[this.draggedIndex]?.key}" from ${this.draggedIndex} to ${newIndex}`);

    // Only update data if position changed
    if (newIndex !== this.draggedIndex && newIndex >= 0) {
      // Move item in array from draggedIndex to newIndex
      const movedItem = this.items.splice(this.draggedIndex, 1)[0];
      this.items.splice(newIndex, 0, movedItem);

      console.log('New order:', this.items.map(item => item.key).join(', '));

      // Save and re-render to ensure consistency
      await this.saveItems();
      this.renderItems();

      console.log('Drag complete - data saved and re-rendered');
    } else {
      console.log('No position change detected');
    }
  }

  // Clean up drag state
  cleanupDragState() {
    // Remove dragging classes
    const itemsList = document.getElementById('itemsList');
    itemsList.classList.remove('dragging');

    if (this.draggedElement) {
      this.draggedElement.classList.remove('dragging');
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
  }

  // Validate input
  validateInput() {
    const keyInput = document.getElementById('keyInput');
    const valueInput = document.getElementById('valueInput');
    const addBtn = document.getElementById('addBtn');

    const hasKey = keyInput.value.trim().length > 0;
    const hasValue = valueInput.value.trim().length > 0;

    addBtn.disabled = !(hasKey && hasValue);
  }

  // Add new item
  async addItem() {
    const keyInput = document.getElementById('keyInput');
    const valueInput = document.getElementById('valueInput');

    const key = keyInput.value.trim();
    const value = valueInput.value.trim();

    if (!key || !value) {
      return;
    }

    const newItem = {
      id: Date.now().toString(),
      key,
      value,
      createdAt: new Date().toISOString()
    };

    // Add to beginning of array (newest first)
    this.items.unshift(newItem);

    await this.saveItems();
    this.renderItems();

    // Clear input fields
    keyInput.value = '';
    valueInput.value = '';
    keyInput.focus();
  }

  // Copy to clipboard
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      this.showCopyFeedback();
    } catch (error) {
      // Fallback method for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      this.showCopyFeedback();
    }
  }

  // Show copy success feedback
  showCopyFeedback() {
    this.showCustomFeedback('Copied!', '#333');
  }

  // Show custom feedback with text and color
  showCustomFeedback(text, backgroundColor = '#333') {
    const feedback = document.createElement('div');
    feedback.className = 'copy-feedback';
    feedback.textContent = text;
    feedback.style.backgroundColor = backgroundColor;
    document.body.appendChild(feedback);

    // Show animation
    setTimeout(() => feedback.classList.add('show'), 10);

    // Remove after 2 seconds
    setTimeout(() => {
      feedback.classList.remove('show');
      setTimeout(() => {
        if (feedback.parentNode) {
          feedback.parentNode.removeChild(feedback);
        }
      }, 200);
    }, 2000);
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
    const itemElement = document.querySelector(`[data-index="${index}"]`);
    const keyInput = itemElement.querySelector('.edit-key');
    const valueInput = itemElement.querySelector('.edit-value');

    const newKey = keyInput.value.trim();
    const newValue = valueInput.value.trim();

    if (!newKey || !newValue) {
      return;
    }

    this.items[index].key = newKey;
    this.items[index].value = newValue;

    await this.saveItems();
    this.editingId = null;
    this.renderItems();
  }

  // Cancel edit
  cancelEdit() {
    if (this.editingId !== null) {
      this.editingId = null;
      this.renderItems();
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
      <span style="font-size: 11px; display: flex; gap: 4px; align-items: center;">
        <button class="confirm-clear-yes" style="background: #dc2626; border: none; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; cursor: pointer;">Yes</button>
        <button class="confirm-clear-no" style="background: #059669; border: none; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; cursor: pointer;">No</button>
      </span>
    `;
    clearAllBtn.style.background = '#f59e0b';
    clearAllBtn.style.padding = '4px 8px';
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
    clearAllBtn.textContent = 'Clear All';
    clearAllBtn.style.background = '#ef4444';
    clearAllBtn.style.padding = '6px 12px';
    clearAllBtn.title = 'Clear all records';
    this.updateClearAllButton();
  }

  // Update clear all button state
  updateClearAllButton() {
    const clearAllBtn = document.getElementById('clearAllBtn');
    const count = this.items.length;

    if (count === 0) {
      clearAllBtn.disabled = true;
      clearAllBtn.style.opacity = '0.5';
      clearAllBtn.style.cursor = 'not-allowed';
      clearAllBtn.title = 'No records to clear';
    } else {
      clearAllBtn.disabled = false;
      clearAllBtn.style.opacity = '0.8';
      clearAllBtn.style.cursor = 'pointer';
      clearAllBtn.title = `Clear all ${count} records`;
    }
  }

  // Render items list
  renderItems() {
    const itemsList = document.getElementById('itemsList');
    const itemCount = document.getElementById('itemCount');

    const count = this.items.length;
    itemCount.textContent = count;

    if (count === 0) {
      itemsList.innerHTML = '<div class="empty-message">No items yet. Add your first key-value pair above.</div>';
      this.updateClearAllButton();
      return;
    }

    itemsList.innerHTML = this.items.map((item, index) => `
      <div class="item" data-index="${index}" data-original-index="${index}">
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
      </div>
    `).join('');

    this.updateClearAllButton();
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