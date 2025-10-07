# Ako Key-Value Store

A simple and elegant Chrome extension for storing and managing key-value pairs locally.

## Installation

[Ako Key-Value Store](https://chromewebstore.google.com/detail/gogmmfikekeholnepojdokedjikmfkob)

## Features

- 🎨 **Modern Design** - Clean and beautiful user interface with gradient colors
- 💾 **Local Storage** - Data saved locally, no network required, persists after cache clearing
- ⚡ **Simple Operations** - One-click add, edit, and delete key-value pairs
- 🔒 **Privacy & Security** - All data stays on your device, never uploaded
- 📱 **Responsive Design** - Works on different screen sizes
- ⌨️ **Keyboard Shortcuts** - Enter key support for quick operations
- 🚚 **Drag & Drop** - Reorder items by dragging
- 🎯 **Smart Input** - Prevents duplicate keys, real-time validation
- 📊 **Performance Optimized** - Smart rendering, minimal DOM operations
- 📝 **Debug Logging** - Complete logging system for development

## Usage

### Adding Key-Value Pairs
1. Click the Ako icon in Chrome toolbar
2. Enter key in the "Key" field
3. Enter value in the "Value" field
4. Click "Add" button or press Enter

### Editing Items
1. Click the edit icon ✏️ on any saved item
2. Modify the key or value
3. Click ✓ to save or ✕ to cancel

### Deleting Items
1. Click the delete icon 🗑️ on any saved item
2. Confirm by clicking "Yes"

### Keyboard Shortcuts
- `Tab` / `Enter`: Navigate between input fields
- `Enter`: Add new item (in value field)
- `Enter`: Save edit (in edit mode)
- `Escape`: Cancel edit

## Technical Details

### Storage
- Uses Chrome Extension Storage API (`chrome.storage.local`)
- Persistent storage, survives browser cache clearing
- Supports large storage capacity (up to ~5MB)

### Tech Stack
- **Manifest Version**: V3 (latest version)
- **Frontend**: HTML5 + CSS3 + Vanilla JavaScript
- **Storage**: Chrome Storage API
- **UI Design**: Modern flat design, responsive layout

### File Structure
```
Ako/
├── manifest.json             # Extension config
├── popup.html               # Popup page
├── popup.css                # Styles
├── popup.js                 # Entry point & module loader
├── constants.js             # Constants and configuration
├── logger.js                # Debug logging system
├── storage-manager.js       # Storage with quota monitoring
├── drag-drop-handler.js     # Drag & drop functionality
├── ako-store.js             # Main application logic
├── icons/                   # Icon folder
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   ├── icon128.png
│   └── README.md
├── Makefile                 # Build script
└── README.md
```

## Development

### Permissions
- `storage`: For local data storage

### Compatibility
- Chrome 88+
- Based on Manifest V3 (Chrome's latest standard)

### Security
- All data stored locally only
- No network requests
- No user data collection
- Open source, transparent and auditable

## Use Cases

- **Developer Tools**: Save API keys, config parameters
- **Study Notes**: Record definitions, code snippets
- **Daily Records**: Store useful info, quick memos
- **Password Management**: Temporarily save non-sensitive login info
- **Data Collection**: Organize categorized information

## 📄 License

[MIT License](LICENSE)

## Acknowledgments

Thanks to all users who provided suggestions and feedback for this project.
