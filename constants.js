// Constants and Configuration
const CONSTANTS = {
  STORAGE_KEY: 'akoItems',
  STORAGE_KEY_VALUES_VISIBLE: 'akoValuesVisible',
  DRAG_THRESHOLD: 5,
  FEEDBACK_DURATION: 2000,
  CLEAR_TIMEOUT: 5000,
  STORAGE_QUOTA_WARNING_THRESHOLD: 0.8, // Warn at 80% usage
  STORAGE_QUOTA_MAX: 5 * 1024 * 1024, // ~5MB for chrome.storage.local

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
