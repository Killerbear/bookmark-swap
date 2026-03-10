// Common emojis for profiles
const COMMON_EMOJIS = [
  '💼', '🏠', '🎮', '📚', '🎵', '🎬', '🏋️', '🍔',
  '✈️', '🛒', '💰', '🎨', '🔬', '⚽', '🎓', '🏥',
  '🚗', '📱', '💻', '🎯', '🌟', '🔥', '💡', '🎉',
  '📁', '🗂️', '📊', '📈', '🎪', '🎭', '🎸', '🎤'
];

// Predefined colors — 8 hue families × 3 lightness tiers (soft → vivid → deep)
// Columns: Red, Orange, Amber, Green, Teal, Blue, Indigo, Pink
const COLOR_PALETTE = [
  // Soft
  '#e57373', '#ffb74d', '#ffd54f', '#81c784', '#4db6ac', '#64b5f6', '#7986cb', '#f06292',
  // Vivid
  '#e53935', '#fb8c00', '#ffb300', '#43a047', '#00897b', '#1e88e5', '#3949ab', '#d81b60',
  // Deep
  '#b71c1c', '#e65100', '#ff8f00', '#2e7d32', '#00695c', '#1565c0', '#283593', '#ad1457',
];

const COLOR_ROW_LABELS = ['Soft', 'Vivid', 'Deep'];
const COLOR_COLUMNS = 8;

let currentEditingProfile = null;
let messageTimeout = null;

// Load and display profiles
async function loadProfiles() {
  const response = await chrome.runtime.sendMessage({ action: 'getState' });
  const { profiles, profileSettings, activeProfile } = response;

  const profilesList = document.getElementById('profilesList');
  profilesList.innerHTML = '';

  profiles.forEach((profile, index) => {
    const settings = profileSettings[profile] || { emoji: '📁', color: '#2196f3' };
    const isActive = profile === activeProfile;

    const profileItem = document.createElement('div');
    profileItem.className = 'profile-item';
    profileItem.draggable = true;
    profileItem.dataset.profile = profile;
    profileItem.dataset.index = index;

    if (isActive) {
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

    const emojiSpan = document.createElement('span');
    emojiSpan.className = 'profile-emoji';
    emojiSpan.textContent = settings.emoji;
    emojiSpan.title = 'Click to change emoji';
    emojiSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      showEmojiPicker(profile, e.target);
    });

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

    // Name group with badge
    const nameGroup = document.createElement('div');
    nameGroup.className = 'profile-name-group';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'profile-name';
    nameSpan.textContent = profile;

    nameGroup.appendChild(nameSpan);

    if (isActive) {
      const badge = document.createElement('span');
      badge.className = 'profile-badge';
      badge.textContent = 'Active';
      nameGroup.appendChild(badge);
    }

    profileInfo.appendChild(profileVisual);
    profileInfo.appendChild(nameGroup);

    // Actions section
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'profile-actions';

    const renameBtn = document.createElement('button');
    renameBtn.className = 'icon-btn';
    renameBtn.textContent = '✏️';
    renameBtn.title = 'Rename';
    renameBtn.addEventListener('click', () => startInlineRename(profile, nameSpan, nameGroup));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-btn danger';
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = 'Delete';
    deleteBtn.addEventListener('click', () => showDeleteConfirm(profile, settings.emoji));

    if (profiles.length <= 1) {
      deleteBtn.disabled = true;
      deleteBtn.title = 'Cannot delete the last profile';
    } else if (isActive) {
      deleteBtn.disabled = true;
      deleteBtn.title = 'Cannot delete the active profile';
    }

    actionsDiv.appendChild(renameBtn);
    actionsDiv.appendChild(deleteBtn);

    profileItem.appendChild(dragHandle);
    profileItem.appendChild(profileInfo);
    profileItem.appendChild(actionsDiv);

    // Drag events
    profileItem.addEventListener('dragstart', handleDragStart);
    profileItem.addEventListener('dragover', handleDragOver);
    profileItem.addEventListener('drop', handleDrop);
    profileItem.addEventListener('dragend', handleDragEnd);
    profileItem.addEventListener('dragleave', handleDragLeave);

    profilesList.appendChild(profileItem);
  });
}


// ── Inline Rename ──────────────────────────────────

function startInlineRename(oldName, nameSpan, nameGroup) {
  const input = document.createElement('input');
  input.className = 'rename-input';
  input.value = oldName;
  input.type = 'text';

  // Hide original name
  nameSpan.style.display = 'none';

  // Hide badge if present
  const badge = nameGroup.querySelector('.profile-badge');
  if (badge) badge.style.display = 'none';

  nameGroup.insertBefore(input, nameSpan);
  input.focus();
  input.select();

  const commitRename = async () => {
    const newName = input.value.trim();
    input.remove();
    nameSpan.style.display = '';
    if (badge) badge.style.display = '';

    if (!newName || newName === oldName) return;

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'renameProfile',
        oldName: oldName,
        newName: newName
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
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
    if (e.key === 'Escape') {
      input.remove();
      nameSpan.style.display = '';
      if (badge) badge.style.display = '';
    }
  });

  input.addEventListener('blur', commitRename);
}


// ── Styled Delete Confirmation ─────────────────────

function showDeleteConfirm(profileName) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';

  overlay.innerHTML = `
    <div class="confirm-dialog">
      <div class="confirm-icon">🗑️</div>
      <h3>Delete "${profileName}"?</h3>
      <p>All bookmarks in this profile will be permanently deleted. This action cannot be undone.</p>
      <div class="confirm-actions">
        <button class="cancel-btn">Cancel</button>
        <button class="danger-btn">Delete Profile</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  overlay.querySelector('.cancel-btn').addEventListener('click', () => overlay.remove());

  overlay.querySelector('.danger-btn').addEventListener('click', async () => {
    overlay.remove();

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
  });

  // Close on Escape
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}


// ── Drag and Drop ──────────────────────────────────

let draggedElement = null;

function handleDragStart(e) {
  draggedElement = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  this.classList.add('drag-over');
  return false;
}

function handleDragLeave() {
  this.classList.remove('drag-over');
}

function handleDrop(e) {
  e.stopPropagation();

  if (draggedElement !== this) {
    const allItems = Array.from(document.querySelectorAll('.profile-item'));
    const draggedIndex = allItems.indexOf(draggedElement);
    const targetIndex = allItems.indexOf(this);

    if (draggedIndex < targetIndex) {
      this.parentNode.insertBefore(draggedElement, this.nextSibling);
    } else {
      this.parentNode.insertBefore(draggedElement, this);
    }

    updateProfileOrder();
  }

  this.classList.remove('drag-over');
  return false;
}

function handleDragEnd() {
  this.classList.remove('dragging');
  document.querySelectorAll('.profile-item').forEach(item => {
    item.classList.remove('drag-over');
  });
}

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
      await loadProfiles();
    }
  } catch (error) {
    showMessage('Error: ' + error.message, 'error');
    await loadProfiles();
  }
}


// ── Emoji Picker ───────────────────────────────────

function showEmojiPicker(profileName, targetElement) {
  hideColorPicker();
  currentEditingProfile = profileName;

  const picker = document.getElementById('emojiPicker');
  const grid = document.getElementById('emojiGrid');

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

  const rect = targetElement.getBoundingClientRect();
  picker.style.left = `${rect.left}px`;
  picker.style.top = `${rect.bottom + 5}px`;
  picker.classList.add('show');
}

function hideEmojiPicker() {
  document.getElementById('emojiPicker').classList.remove('show');
  currentEditingProfile = null;
}

async function updateEmoji(profileName, emoji) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'updateProfileSettings',
      profileName: profileName,
      settings: { emoji }
    });
    if (response.success) await loadProfiles();
    else showMessage(response.error || 'Failed to update emoji', 'error');
  } catch (error) {
    showMessage('Error: ' + error.message, 'error');
  }
}


// ── Color Picker ───────────────────────────────────

function showColorPicker(profileName, currentColor, targetElement) {
  hideEmojiPicker();
  currentEditingProfile = profileName;

  const picker = document.getElementById('colorPicker');
  const grid = document.getElementById('colorGrid');
  const customInput = document.getElementById('customColorInput');
  const colorPreview = document.getElementById('colorPreview');

  grid.innerHTML = '';

  // Build grid with row labels and color swatches
  for (let row = 0; row < COLOR_ROW_LABELS.length; row++) {
    // Row label spanning the full row
    const label = document.createElement('div');
    label.className = 'color-row-label';
    label.textContent = COLOR_ROW_LABELS[row];
    grid.appendChild(label);

    // Color swatches for this row
    for (let col = 0; col < COLOR_COLUMNS; col++) {
      const color = COLOR_PALETTE[row * COLOR_COLUMNS + col];
      const colorOption = document.createElement('div');
      colorOption.className = 'color-option';
      colorOption.style.backgroundColor = color;
      colorOption.title = color;

      if (color.toLowerCase() === currentColor.toLowerCase()) {
        colorOption.classList.add('selected');
      }

      colorOption.addEventListener('click', () => {
        updateColor(profileName, color);
        hideColorPicker();
      });
      grid.appendChild(colorOption);
    }
  }

  customInput.value = currentColor;
  colorPreview.style.backgroundColor = currentColor;

  const rect = targetElement.getBoundingClientRect();
  picker.style.left = `${rect.left}px`;
  picker.style.top = `${rect.bottom + 5}px`;
  picker.classList.add('show');
}

function hideColorPicker() {
  document.getElementById('colorPicker').classList.remove('show');
  currentEditingProfile = null;
}

async function updateColor(profileName, color) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'updateProfileSettings',
      profileName: profileName,
      settings: { color }
    });
    if (response.success) await loadProfiles();
    else showMessage(response.error || 'Failed to update color', 'error');
  } catch (error) {
    showMessage('Error: ' + error.message, 'error');
  }
}


// ── Messages ───────────────────────────────────────

function showMessage(text, type) {
  const messageEl = document.getElementById('message');

  // Clear any existing timeout
  if (messageTimeout) clearTimeout(messageTimeout);

  messageEl.textContent = text;
  messageEl.className = `message ${type} show`;

  messageTimeout = setTimeout(() => {
    messageEl.classList.add('hiding');
    setTimeout(() => {
      messageEl.classList.remove('show', 'hiding');
    }, 250);
  }, 3000);
}


// ── Add Profile ────────────────────────────────────

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


// ── Event Listeners ────────────────────────────────

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

// Custom color input — live preview
document.getElementById('customColorInput').addEventListener('input', (e) => {
  const color = e.target.value;
  if (/^#[0-9A-F]{6}$/i.test(color)) {
    document.getElementById('colorPreview').style.backgroundColor = color;
  }
});

// Apply custom color button
document.getElementById('applyCustomColor').addEventListener('click', () => {
  const color = document.getElementById('customColorInput').value;

  if (!/^#[0-9A-F]{6}$/i.test(color)) {
    showMessage('Invalid color format. Use hex format like #2196f3', 'error');
    return;
  }

  if (currentEditingProfile) {
    updateColor(currentEditingProfile, color);
    hideColorPicker();
  }
});

document.getElementById('addProfileBtn').addEventListener('click', addProfile);
document.getElementById('newProfileName').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') addProfile();
});

// Load profiles on page load
loadProfiles();
