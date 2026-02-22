// Constants
const STORAGE_FOLDER_NAME = '_BookmarkSwap';
const BOOKMARK_BAR_ID = '1'; // Chrome's bookmark bar has ID '1'

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  await initializeExtension();
  await updateContextMenu();
});

// Initialize storage and default profile
async function initializeExtension() {
  const storage = await chrome.storage.local.get(['profiles', 'profileSettings', 'activeProfile', 'initialized']);

  if (!storage.initialized) {
    // First time setup with default profiles
    const profiles = ['Work', 'Personal'];
    const profileSettings = {
      'Work': { emoji: '💼', color: '#2196f3' },
      'Personal': { emoji: '🏠', color: '#4caf50' }
    };

    await chrome.storage.local.set({
      profiles: profiles,
      profileSettings: profileSettings,
      activeProfile: null,
      initialized: true
    });

    // Create storage folder structure
    await ensureStorageFolder();
    for (const profile of profiles) {
      await ensureProfileFolder(profile);
    }
  }
}

// Get or create the main storage folder
async function ensureStorageFolder() {
  const tree = await chrome.bookmarks.getTree();

  // Find "Other Bookmarks" folder - it's not always ID "2"
  // Look for a folder that's not the bookmark bar (id !== '1')
  const otherBookmarks = tree[0].children.find(n => n.id !== '1' && n.children);

  if (!otherBookmarks) {
    return null;
  }

  // Check if storage folder exists
  let storageFolder = otherBookmarks.children?.find(n => n.title === STORAGE_FOLDER_NAME);

  if (!storageFolder) {
    storageFolder = await chrome.bookmarks.create({
      parentId: otherBookmarks.id,
      title: STORAGE_FOLDER_NAME
    });
  }

  return storageFolder;
}

// Get or create a profile folder
async function ensureProfileFolder(profileName) {
  const storageFolder = await ensureStorageFolder();

  if (!storageFolder) {
    return null;
  }

  // Get children of storage folder
  const children = await chrome.bookmarks.getChildren(storageFolder.id);

  let profileFolder = children.find(n => n.title === profileName);

  if (!profileFolder) {
    profileFolder = await chrome.bookmarks.create({
      parentId: storageFolder.id,
      title: profileName
    });
  }

  return profileFolder;
}

// Get bookmark bar items (excluding folders we don't want to move)
async function getBookmarkBarItems() {
  const bookmarkBar = await chrome.bookmarks.getChildren(BOOKMARK_BAR_ID);
  // Filter out the storage folder if it somehow ends up in bookmark bar
  return bookmarkBar.filter(item => item.title !== STORAGE_FOLDER_NAME);
}

// Switch to a different profile
async function switchProfile(targetProfile) {
  const { activeProfile } = await chrome.storage.local.get(['activeProfile']);

  // Don't switch if already on this profile
  if (activeProfile === targetProfile) {
    return;
  }

  // Step 1: Save current bookmark bar to active profile (if any)
  const currentItems = await getBookmarkBarItems();

  if (activeProfile && currentItems.length > 0) {
    const activeFolder = await ensureProfileFolder(activeProfile);

    if (activeFolder) {
      // Move all items to storage
      for (const item of currentItems) {
        try {
          await chrome.bookmarks.move(item.id, {
            parentId: activeFolder.id
          });
        } catch (error) {
          // Silently handle errors
        }
      }
    }
  }

  // Step 2: Load target profile into bookmark bar
  const targetFolder = await ensureProfileFolder(targetProfile);

  if (targetFolder) {
    const storedItems = await chrome.bookmarks.getChildren(targetFolder.id);

    // Move all items to bookmark bar
    for (let i = 0; i < storedItems.length; i++) {
      try {
        await chrome.bookmarks.move(storedItems[i].id, {
          parentId: BOOKMARK_BAR_ID,
          index: i
        });
      } catch (error) {
        // Silently handle errors
      }
    }
  }

  // Step 3: Update active profile
  await chrome.storage.local.set({ activeProfile: targetProfile });
  await updateContextMenu();
}

// Update context menu with current profiles
async function updateContextMenu() {
  await chrome.contextMenus.removeAll();

  const { profiles, profileSettings, activeProfile } = await chrome.storage.local.get(['profiles', 'profileSettings', 'activeProfile']);

  chrome.contextMenus.create({
    id: 'bookmark-swap-root',
    title: 'Bookmark Swap',
    contexts: ['action']
  });

  for (const profile of profiles) {
    const isActive = profile === activeProfile;
    const settings = profileSettings[profile] || { emoji: '📁', color: '#2196f3' };
    const emoji = settings.emoji || '📁';

    chrome.contextMenus.create({
      id: `profile-${profile}`,
      parentId: 'bookmark-swap-root',
      title: isActive ? `✓ ${emoji} ${profile}` : `${emoji} ${profile}`,
      contexts: ['action']
    });
  }

  chrome.contextMenus.create({
    id: 'separator',
    parentId: 'bookmark-swap-root',
    type: 'separator',
    contexts: ['action']
  });

  chrome.contextMenus.create({
    id: 'manage-profiles',
    parentId: 'bookmark-swap-root',
    title: 'Manage Profiles...',
    contexts: ['action']
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === 'manage-profiles') {
    chrome.runtime.openOptionsPage();
  } else if (info.menuItemId.startsWith('profile-')) {
    const profileName = info.menuItemId.replace('profile-', '');
    await switchProfile(profileName);
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'switchProfile') {
    switchProfile(message.profile).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep channel open for async response
  }

  if (message.action === 'getState') {
    chrome.storage.local.get(['profiles', 'profileSettings', 'activeProfile']).then(data => {
      sendResponse(data);
    });
    return true;
  }

  if (message.action === 'getBookmarkCount') {
    getBookmarkBarItems().then(items => {
      sendResponse({ count: items.length });
    });
    return true;
  }

  if (message.action === 'addProfile') {
    addProfile(message.profileName).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (message.action === 'deleteProfile') {
    deleteProfile(message.profileName).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (message.action === 'renameProfile') {
    renameProfile(message.oldName, message.newName).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (message.action === 'updateProfileSettings') {
    updateProfileSettings(message.profileName, message.settings).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (message.action === 'reorderProfiles') {
    reorderProfiles(message.profiles).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// Add a new profile
async function addProfile(profileName) {
  const { profiles, profileSettings } = await chrome.storage.local.get(['profiles', 'profileSettings']);

  if (profiles.includes(profileName)) {
    throw new Error('Profile already exists');
  }

  profiles.push(profileName);

  // Add default settings for new profile
  profileSettings[profileName] = { emoji: '📁', color: '#2196f3' };

  await chrome.storage.local.set({ profiles, profileSettings });
  await ensureProfileFolder(profileName);
  await updateContextMenu();
}

// Delete a profile
async function deleteProfile(profileName) {
  const { profiles, profileSettings, activeProfile } = await chrome.storage.local.get(['profiles', 'profileSettings', 'activeProfile']);

  if (profiles.length <= 1) {
    throw new Error('Cannot delete the last profile');
  }

  if (activeProfile === profileName) {
    throw new Error('Cannot delete the active profile. Switch to another profile first.');
  }

  // Remove from profiles list
  const updatedProfiles = profiles.filter(p => p !== profileName);

  // Remove profile settings
  delete profileSettings[profileName];

  await chrome.storage.local.set({ profiles: updatedProfiles, profileSettings });

  // Delete the folder and its bookmarks
  const profileFolder = await ensureProfileFolder(profileName);
  if (profileFolder) {
    await chrome.bookmarks.removeTree(profileFolder.id);
  }

  await updateContextMenu();
}

// Rename a profile
async function renameProfile(oldName, newName) {
  const { profiles, profileSettings, activeProfile } = await chrome.storage.local.get(['profiles', 'profileSettings', 'activeProfile']);

  if (profiles.includes(newName)) {
    throw new Error('A profile with this name already exists');
  }

  // Update profiles list
  const updatedProfiles = profiles.map(p => p === oldName ? newName : p);

  // Transfer settings to new name
  profileSettings[newName] = profileSettings[oldName];
  delete profileSettings[oldName];

  await chrome.storage.local.set({ profiles: updatedProfiles, profileSettings });

  // Update active profile if it was the renamed one
  if (activeProfile === oldName) {
    await chrome.storage.local.set({ activeProfile: newName });
  }

  // Rename the folder
  const oldFolder = await ensureProfileFolder(oldName);
  if (oldFolder) {
    await chrome.bookmarks.update(oldFolder.id, { title: newName });
  }

  await updateContextMenu();
}

// Update profile settings (emoji and color)
async function updateProfileSettings(profileName, settings) {
  const { profileSettings } = await chrome.storage.local.get(['profileSettings']);

  profileSettings[profileName] = {
    ...profileSettings[profileName],
    ...settings
  };

  await chrome.storage.local.set({ profileSettings });
  await updateContextMenu();
}

// Reorder profiles
async function reorderProfiles(newOrder) {
  const { profiles } = await chrome.storage.local.get(['profiles']);

  // Validate that all profiles are present
  if (newOrder.length !== profiles.length || !newOrder.every(p => profiles.includes(p))) {
    throw new Error('Invalid profile order');
  }

  await chrome.storage.local.set({ profiles: newOrder });
  await updateContextMenu();
}
