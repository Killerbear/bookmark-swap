// Common emojis for profiles
const COMMON_EMOJIS = [
  '💼', '🏠', '🎮', '📚', '🎵', '🎬', '🏋️', '🍔',
  '✈️', '🛒', '💰', '🎨', '🔬', '⚽', '🎓', '🏥',
  '🚗', '📱', '💻', '🎯', '🌟', '🔥', '💡', '🎉',
  '📁', '🗂️', '📊', '📈', '🎪', '🎭', '🎸', '🎤'
];

// Predefined colors for profiles
const COMMON_COLORS = [
  '#2196f3', // Blue
  '#4caf50', // Green
  '#f44336', // Red
  '#ff9800', // Orange
  '#9c27b0', // Purple
  '#00bcd4', // Cyan
  '#ffeb3b', // Yellow
  '#e91e63', // Pink
  '#795548', // Brown
  '#607d8b', // Blue Grey
  '#ff5722', // Deep Orange
  '#3f51b5', // Indigo
  '#009688', // Teal
  '#8bc34a', // Light Green
  '#ffc107', // Amber
  '#673ab7', // Deep Purple
  '#03a9f4', // Light Blue
  '#cddc39'  // Lime
];

let currentEditingProfile = null;

// Load and display profiles
async function loadProfiles() {
  const response = await chrome.runtime.sendMessage({ action: 'getState' });
  const { profiles, profileSettings, activeProfile } = response;

  const profilesList = document.getElementById('profilesList');
  profilesList.innerHTML = '';

  profiles.forEach((profile, index) => {
    const settings = profileSettings[profile] || { emoji: '📁', color: '#2196f3' };

    const profileItem = document.createElement('div');
    profileItem.className = 'profile-item';
    profileItem.draggable = true;
    profileItem.dataset.profile = profile;
    profileItem.dataset.index = index;

    if (profile === activeProfile) {
      profileItem.classList.add('active');
    }

    // Drag handle
    const dragHandle = document.createElement('span');
    dragHandle.className = 'drag-handle';
    dragHandle.textContent = '⋮⋮';
    dragHandle.title = 'Drag to reorder';

    // Profile info section
    const profileInfo = document.createElement('div');
    profileInfo.className = 'profile-info';

    // Visual elements (emoji and color)
    const profileVisual = document.createElement('div');
    profileVisual.className = 'profile-visual';

    // Emoji
    const emojiSpan = document.createElement('span');
    emojiSpan.className = 'profile-emoji';
    emojiSpan.textContent = settings.emoji;
    emojiSpan.title = 'Click to change emoji';
    emojiSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      showEmojiPicker(profile, e.target);
    });

    // Color
    const colorDiv = document.createElement('div');
    colorDiv.className = 'profile-color';
    colorDiv.style.backgroundColor = settings.color;
    colorDiv.title = 'Click to change color';
    colorDiv.addEventListener('click', (e) => {
      e.stopPropagation();
      showColorPicker(profile, settings.color, e.target);
    });

    profileVisual.appendChild(emojiSpan);
    profileVisual.appendChild(colorDiv);

    // Profile name
    const nameSpan = document.createElement('span');
    nameSpan.className = 'profile-name';
    nameSpan.textContent = profile;
    if (profile === activeProfile) {
      nameSpan.textContent += ' (Active)';
    }

    profileInfo.appendChild(profileVisual);
    profileInfo.appendChild(nameSpan);

    // Actions section
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'profile-actions';

    // Rename button
    const renameBtn = document.createElement('button');
    renameBtn.textContent = 'Rename';
    renameBtn.className = 'secondary-btn small-btn';
    renameBtn.addEventListener('click', () => renameProfile(profile));

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.className = 'secondary-btn small-btn';
    deleteBtn.addEventListener('click', () => deleteProfile(profile));

    // Disable delete if it's the only profile or active profile
    if (profiles.length <= 1) {
      deleteBtn.disabled = true;
      deleteBtn.title = 'Cannot delete the last profile';
    } else if (profile === activeProfile) {
      deleteBtn.disabled = true;
      deleteBtn.title = 'Cannot delete the active profile';
    }

    actionsDiv.appendChild(renameBtn);
    actionsDiv.appendChild(deleteBtn);

    profileItem.appendChild(dragHandle);
    profileItem.appendChild(profileInfo);
    profileItem.appendChild(actionsDiv);

    // Add drag event listeners
    profileItem.addEventListener('dragstart', handleDragStart);
    profileItem.addEventListener('dragover', handleDragOver);
    profileItem.addEventListener('drop', handleDrop);
    profileItem.addEventListener('dragend', handleDragEnd);
    profileItem.addEventListener('dragleave', handleDragLeave);

    profilesList.appendChild(profileItem);
  });
}

// Drag and drop handlers
let draggedElement = null;

function handleDragStart(e) {
  draggedElement = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'move';

  const afterElement = getDragAfterElement(e.clientY);
  if (afterElement == null) {
    this.classList.add('drag-over');
  }

  return false;
}

function handleDragLeave(e) {
  this.classList.remove('drag-over');
}

function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }

  if (draggedElement !== this) {
    const allItems = Array.from(document.querySelectorAll('.profile-item'));
    const draggedIndex = allItems.indexOf(draggedElement);
    const targetIndex = allItems.indexOf(this);

    if (draggedIndex < targetIndex) {
      this.parentNode.insertBefore(draggedElement, this.nextSibling);
    } else {
      this.parentNode.insertBefore(draggedElement, this);
    }

    // Update profile order in storage
    updateProfileOrder();
  }

  this.classList.remove('drag-over');
  return false;
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  document.querySelectorAll('.profile-item').forEach(item => {
    item.classList.remove('drag-over');
  });
}

function getDragAfterElement(y) {
  const draggableElements = [...document.querySelectorAll('.profile-item:not(.dragging)')];

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

// Update profile order in storage
async function updateProfileOrder() {
  const profileItems = Array.from(document.querySelectorAll('.profile-item'));
  const newOrder = profileItems.map(item => item.dataset.profile);

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'reorderProfiles',
      profiles: newOrder
    });

    if (!response.success) {
      showMessage(response.error || 'Failed to reorder profiles', 'error');
      await loadProfiles(); // Reload on error
    }
  } catch (error) {
    showMessage('Error: ' + error.message, 'error');
    await loadProfiles(); // Reload on error
  }
}

// Show emoji picker
function showEmojiPicker(profileName, targetElement) {
  // Close color picker if open
  hideColorPicker();

  currentEditingProfile = profileName;

  const picker = document.getElementById('emojiPicker');
  const grid = document.getElementById('emojiGrid');

  // Populate emoji grid
  grid.innerHTML = '';
  COMMON_EMOJIS.forEach(emoji => {
    const emojiOption = document.createElement('div');
    emojiOption.className = 'emoji-option';
    emojiOption.textContent = emoji;
    emojiOption.addEventListener('click', () => {
      updateEmoji(profileName, emoji);
      hideEmojiPicker();
    });
    grid.appendChild(emojiOption);
  });

  // Position picker near the clicked element
  const rect = targetElement.getBoundingClientRect();
  picker.style.left = `${rect.left}px`;
  picker.style.top = `${rect.bottom + 5}px`;
  picker.classList.add('show');
}

// Hide emoji picker
function hideEmojiPicker() {
  const picker = document.getElementById('emojiPicker');
  picker.classList.remove('show');
  currentEditingProfile = null;
}

// Update emoji
async function updateEmoji(profileName, emoji) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'updateProfileSettings',
      profileName: profileName,
      settings: { emoji: emoji }
    });

    if (response.success) {
      await loadProfiles();
    } else {
      showMessage(response.error || 'Failed to update emoji', 'error');
    }
  } catch (error) {
    showMessage('Error: ' + error.message, 'error');
  }
}

// Show color picker
function showColorPicker(profileName, currentColor, targetElement) {
  // Close emoji picker if open
  hideEmojiPicker();

  currentEditingProfile = profileName;

  const picker = document.getElementById('colorPicker');
  const grid = document.getElementById('colorGrid');
  const customInput = document.getElementById('customColorInput');
  const colorPreview = document.getElementById('colorPreview');

  // Populate color grid
  grid.innerHTML = '';
  COMMON_COLORS.forEach(color => {
    const colorOption = document.createElement('div');
    colorOption.className = 'color-option';
    colorOption.style.backgroundColor = color;
    colorOption.title = color;
    colorOption.addEventListener('click', () => {
      updateColor(profileName, color);
      hideColorPicker();
    });
    grid.appendChild(colorOption);
  });

  // Set custom input to current color
  customInput.value = currentColor;
  colorPreview.style.backgroundColor = currentColor;

  // Position picker near the clicked element
  const rect = targetElement.getBoundingClientRect();
  picker.style.left = `${rect.left}px`;
  picker.style.top = `${rect.bottom + 5}px`;
  picker.classList.add('show');
}

// Hide color picker
function hideColorPicker() {
  const picker = document.getElementById('colorPicker');
  picker.classList.remove('show');
  currentEditingProfile = null;
}

// Update color
async function updateColor(profileName, color) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'updateProfileSettings',
      profileName: profileName,
      settings: { color: color }
    });

    if (response.success) {
      await loadProfiles();
    } else {
      showMessage(response.error || 'Failed to update color', 'error');
    }
  } catch (error) {
    showMessage('Error: ' + error.message, 'error');
  }
}

// Legacy function kept for compatibility
async function changeColor(profileName, currentColor) {
  // This will now be handled by showColorPicker
}

// Show message
function showMessage(text, type) {
  const messageEl = document.getElementById('message');
  messageEl.textContent = text;
  messageEl.className = `message ${type} show`;

  setTimeout(() => {
    messageEl.classList.remove('show');
  }, 3000);
}

// Add new profile
async function addProfile() {
  const input = document.getElementById('newProfileName');
  const profileName = input.value.trim();

  if (!profileName) {
    showMessage('Please enter a profile name', 'error');
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'addProfile',
      profileName: profileName
    });

    if (response.success) {
      showMessage(`Profile "${profileName}" added successfully`, 'success');
      input.value = '';
      await loadProfiles();
    } else {
      showMessage(response.error || 'Failed to add profile', 'error');
    }
  } catch (error) {
    showMessage('Error: ' + error.message, 'error');
  }
}

// Rename profile
async function renameProfile(oldName) {
  const newName = prompt(`Rename profile "${oldName}" to:`, oldName);

  if (!newName || newName === oldName) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'renameProfile',
      oldName: oldName,
      newName: newName.trim()
    });

    if (response.success) {
      showMessage(`Profile renamed to "${newName}"`, 'success');
      await loadProfiles();
    } else {
      showMessage(response.error || 'Failed to rename profile', 'error');
    }
  } catch (error) {
    showMessage('Error: ' + error.message, 'error');
  }
}

// Delete profile
async function deleteProfile(profileName) {
  const confirmed = confirm(
    `Are you sure you want to delete the profile "${profileName}"?\n\n` +
    `All bookmarks in this profile will be permanently deleted!`
  );

  if (!confirmed) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'deleteProfile',
      profileName: profileName
    });

    if (response.success) {
      showMessage(`Profile "${profileName}" deleted`, 'success');
      await loadProfiles();
    } else {
      showMessage(response.error || 'Failed to delete profile', 'error');
    }
  } catch (error) {
    showMessage('Error: ' + error.message, 'error');
  }
}

// Close pickers when clicking outside
document.addEventListener('click', (e) => {
  const emojiPicker = document.getElementById('emojiPicker');
  const colorPicker = document.getElementById('colorPicker');

  if (!emojiPicker.contains(e.target) && !e.target.classList.contains('profile-emoji')) {
    hideEmojiPicker();
  }

  if (!colorPicker.contains(e.target) && !e.target.classList.contains('profile-color')) {
    hideColorPicker();
  }
});

// Custom color input - live preview
document.getElementById('customColorInput').addEventListener('input', (e) => {
  const color = e.target.value;
  const preview = document.getElementById('colorPreview');

  // Validate and preview
  if (/^#[0-9A-F]{6}$/i.test(color)) {
    preview.style.backgroundColor = color;
  }
});

// Apply custom color button
document.getElementById('applyCustomColor').addEventListener('click', () => {
  const color = document.getElementById('customColorInput').value;

  // Validate hex color
  if (!/^#[0-9A-F]{6}$/i.test(color)) {
    showMessage('Invalid color format. Use hex format like #2196f3', 'error');
    return;
  }

  if (currentEditingProfile) {
    updateColor(currentEditingProfile, color);
    hideColorPicker();
  }
});

// Event listeners
document.getElementById('addProfileBtn').addEventListener('click', addProfile);
document.getElementById('newProfileName').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    addProfile();
  }
});

// Load profiles on page load
loadProfiles();
