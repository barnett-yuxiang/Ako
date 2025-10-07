// Drag and Drop Handler
class DragDropHandler {
  constructor() {
    // Drag state
    this.draggedElement = null;
    this.draggedIndex = null;
    this.isDragging = false;
    this.mouseDownY = null;
    this.mouseDownX = null;
    this.dragOffset = { x: 0, y: 0 };
  }

  // Mouse down handler - start drag
  handleMouseDown(e, items, itemsList) {
    const dragHandle = e.target.closest('.drag-handle');
    if (!dragHandle) return false;

    const item = dragHandle.closest('.item');
    if (!item) return false;

    e.preventDefault();

    this.isDragging = false;
    this.draggedElement = item;
    this.draggedIndex = parseInt(item.dataset.index);
    this.mouseDownY = e.clientY;
    this.mouseDownX = e.clientX;

    const rect = item.getBoundingClientRect();
    this.dragOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };

    if (isNaN(this.draggedIndex) || this.draggedIndex < 0 || this.draggedIndex >= items.length) {
      logger.warn('Invalid drag index', { index: this.draggedIndex });
      return false;
    }

    logger.debug('Mouse down on drag handle', {
      index: this.draggedIndex,
      key: items[this.draggedIndex]?.key
    });

    return true;
  }

  // Mouse move handler - track drag
  handleMouseMove(e, items, itemsList) {
    if (!this.draggedElement) return false;

    if (!this.isDragging) {
      const deltaY = Math.abs(e.clientY - this.mouseDownY);
      if (deltaY < CONSTANTS.DRAG_THRESHOLD) return false;

      this.isDragging = true;
      this.draggedElement.classList.add(CONSTANTS.CLASSES.DRAGGING);
      itemsList.classList.add(CONSTANTS.CLASSES.DRAGGING);
      document.body.style.userSelect = 'none';

      logger.info('Drag started', {
        index: this.draggedIndex,
        key: items[this.draggedIndex]?.key
      });
    }

    this.updateDraggedElementPosition(e.clientX, e.clientY);
    this.updateDropIndicator(e.clientY, itemsList);

    return true;
  }

  // Mouse up handler - complete drag
  async handleMouseUp(e, items, saveCallback) {
    if (!this.draggedElement) return null;

    let result = null;

    if (this.isDragging) {
      result = await this.completeDrag(e.clientY, items, saveCallback);
      logger.info('Drag ended', {
        movedFrom: this.draggedIndex,
        itemKey: items[this.draggedIndex]?.key
      });
    }

    this.cleanup();
    return result;
  }

  // Update dragged element position
  updateDraggedElementPosition(mouseX, mouseY) {
    if (!this.draggedElement || !this.isDragging) return;

    const x = mouseX - this.dragOffset.x;
    const y = mouseY - this.dragOffset.y;

    this.draggedElement.style.left = `${x}px`;
    this.draggedElement.style.top = `${y}px`;
  }

  // Update drop indicator
  updateDropIndicator(mouseY, itemsList) {
    const afterElement = this.getDragAfterElement(itemsList, mouseY);

    document.querySelectorAll('.drop-indicator').forEach(el => el.classList.remove('drop-indicator'));

    if (afterElement == null) {
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

  // Complete drag operation
  async completeDrag(mouseY, items, saveCallback) {
    if (!this.draggedElement || this.draggedIndex === null) return null;

    const itemsList = document.getElementById('itemsList');
    const afterElement = this.getDragAfterElement(itemsList, mouseY);

    let newIndex;
    if (afterElement == null) {
      newIndex = items.length - 1;
    } else {
      newIndex = parseInt(afterElement.dataset.index);
      if (this.draggedIndex < newIndex) {
        newIndex--;
      }
    }

    if (newIndex !== this.draggedIndex && newIndex >= 0) {
      const startTime = performance.now();
      const movedItem = items.splice(this.draggedIndex, 1)[0];
      items.splice(newIndex, 0, movedItem);

      logger.info('Item reordered', {
        key: movedItem.key,
        from: this.draggedIndex,
        to: newIndex
      });

      await saveCallback(items);

      const dragTime = performance.now() - startTime;
      logger.performance('Drag operation', dragTime, {
        itemCount: items.length,
        moved: `${this.draggedIndex}→${newIndex}`
      });

      return { reordered: true, items };
    }

    return null;
  }

  // Clean up drag state
  cleanup() {
    const itemsList = document.getElementById('itemsList');
    if (itemsList) {
      itemsList.classList.remove('dragging');
    }

    if (this.draggedElement) {
      this.draggedElement.classList.remove('dragging');
      this.draggedElement.style.left = '';
      this.draggedElement.style.top = '';
    }

    document.querySelectorAll('.drop-indicator').forEach(el => el.classList.remove('drop-indicator'));
    document.body.style.userSelect = '';

    this.draggedElement = null;
    this.draggedIndex = null;
    this.isDragging = false;
    this.mouseDownY = null;
    this.mouseDownX = null;
    this.dragOffset = { x: 0, y: 0 };
  }
}

