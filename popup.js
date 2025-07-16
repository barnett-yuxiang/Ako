class AkoStore {
  constructor() {
    this.items = {};
    this.editingId = null;
    this.init();
  }

  async init() {
    await this.loadItems();
    this.setupEventListeners();
    this.renderItems();
    this.validateInput(); // Set initial button state
  }

  // Load data from chrome.storage.local
  async loadItems() {
    try {
      const result = await chrome.storage.local.get(['akoItems']);
      this.items = result.akoItems || {};
    } catch (error) {
      console.error('Failed to load items:', error);
      this.items = {};
    }
  }

  // Save data to chrome.storage.local
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
    const itemsList = document.getElementById('itemsList');

    // Add button click event
    addBtn.addEventListener('click', () => this.addItem());

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

      const itemId = button.closest('.item')?.dataset.id;
      if (!itemId) return;

      if (button.classList.contains('copy-btn')) {
        const itemValue = this.items[itemId]?.value;
        if (itemValue) this.copyToClipboard(itemValue);
      } else if (button.classList.contains('edit-btn')) {
        this.editItem(itemId);
      } else if (button.classList.contains('delete-btn')) {
        this.deleteItem(itemId);
      } else if (button.classList.contains('save-btn')) {
        this.saveEdit(itemId);
      } else if (button.classList.contains('cancel-btn')) {
        this.cancelEdit();
      } else if (button.classList.contains('confirm-yes')) {
        this.confirmDelete(itemId);
      } else if (button.classList.contains('confirm-no')) {
        this.cancelDelete(itemId);
      }
    });
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

    const id = Date.now().toString();
    this.items[id] = {
      id,
      key,
      value,
      createdAt: new Date().toISOString()
    };

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
    const feedback = document.createElement('div');
    feedback.className = 'copy-feedback';
    feedback.textContent = 'Copied!';
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
  editItem(id) {
    if (this.editingId) {
      this.cancelEdit();
    }

    this.editingId = id;
    const item = this.items[id];
    const itemElement = document.querySelector(`[data-id="${id}"]`);

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
    inputs.forEach((input, index) => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          if (index < inputs.length - 1) {
            inputs[index + 1].focus();
          } else {
            this.saveEdit(id);
          }
        } else if (e.key === 'Escape') {
          this.cancelEdit();
        }
      });
    });
  }

  // Save edit
  async saveEdit(id) {
    const itemElement = document.querySelector(`[data-id="${id}"]`);
    const keyInput = itemElement.querySelector('.edit-key');
    const valueInput = itemElement.querySelector('.edit-value');

    const newKey = keyInput.value.trim();
    const newValue = valueInput.value.trim();

    if (!newKey || !newValue) {
      return;
    }

    this.items[id].key = newKey;
    this.items[id].value = newValue;

    await this.saveItems();
    this.editingId = null;
    this.renderItems();
  }

  // Cancel edit
  cancelEdit() {
    if (this.editingId) {
      this.editingId = null;
      this.renderItems();
    }
  }

  // Show delete confirmation
  deleteItem(id) {
    const item = this.items[id];
    const keyName = item ? item.key : 'this item';
    const itemElement = document.querySelector(`[data-id="${id}"]`);

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
  async confirmDelete(id) {
    delete this.items[id];
    await this.saveItems();
    this.renderItems();
  }

  // Cancel delete
  cancelDelete(id) {
    const itemElement = document.querySelector(`[data-id="${id}"]`);
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

  // Render items list
  renderItems() {
    const itemsList = document.getElementById('itemsList');
    const itemCount = document.getElementById('itemCount');

    const itemsArray = Object.values(this.items);
    const count = itemsArray.length;

    itemCount.textContent = count;

    if (count === 0) {
      itemsList.innerHTML = '<div class="empty-message">No items yet. Add your first key-value pair above.</div>';
      return;
    }

    // Sort by creation time (newest first)
    itemsArray.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    itemsList.innerHTML = itemsArray.map(item => `
      <div class="item" data-id="${item.id}">
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