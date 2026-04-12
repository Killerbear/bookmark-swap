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
  const storage = await chrome.storage.sync.get(['profiles', 'profileSettings', 'activeProfile', 'initialized']);

  if (!storage.initialized) {
    // First time setup with default profiles
    const profiles = ['Work', 'Personal'];
    const profileSettings = {
      'Work': { emoji: '💼', color: '#2196f3' },
      'Personal': { emoji: '🏠', color: '#4caf50' }
    };

    await chrome.storage.sync.set({
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

// Find an existing profile folder without creating it
async function findProfileFolder(profileName) {
  const storageFolder = await ensureStorageFolder();
  if (!storageFolder) return null;
  const children = await chrome.bookmarks.getChildren(storageFolder.id);
  return children.find(n => n.title === profileName) || null;
}

// Recursively count all bookmarks (not folders) under a list of nodes
async function countBookmarks(nodes) {
  let count = 0;
  for (const node of nodes) {
    if (node.url) {
      count++;
    } else {
      const children = await chrome.bookmarks.getChildren(node.id);
      count += await countBookmarks(children);
    }
  }
  return count;
}

// Get bookmark bar items (excluding the storage folder)
async function getBookmarkBarItems() {
  const bookmarkBar = await chrome.bookmarks.getChildren(BOOKMARK_BAR_ID);
  return bookmarkBar.filter(item => item.title !== STORAGE_FOLDER_NAME);
}

// Recursively copy a bookmark or folder into a target parent
async function deepCopyBookmarkNode(node, targetParentId, index) {
  if (node.url) {
    // Leaf bookmark
    return await chrome.bookmarks.create({
      parentId: targetParentId,
      title: node.title,
      url: node.url,
      index: index
    });
  }

  // Folder — create it, then copy children recursively
  const newFolder = await chrome.bookmarks.create({
    parentId: targetParentId,
    title: node.title,
    index: index
  });

  const children = await chrome.bookmarks.getChildren(node.id);
  for (let i = 0; i < children.length; i++) {
    await deepCopyBookmarkNode(children[i], newFolder.id, i);
  }

  return newFolder;
}

// Remove all children from a folder (the folder itself stays)
async function clearFolderContents(folderId) {
  const children = await chrome.bookmarks.getChildren(folderId);
  for (const child of children) {
    try {
      if (!child.url) {
        await chrome.bookmarks.removeTree(child.id);
      } else {
        await chrome.bookmarks.remove(child.id);
      }
    } catch (error) {
      // Silently handle removal errors
    }
  }
}

// Switch to a profile (or refresh the current one) using copy-based approach.
// Profile folders always retain their bookmarks (source of truth).
async function switchProfile(targetProfile) {
  const { activeProfile } = await chrome.storage.sync.get(['activeProfile']);

  const currentItems = await getBookmarkBarItems();

  // Step 1: Save current bookmark bar into the active profile folder.
  // On first-ever switch (activeProfile is null), seed the target profile
  // with the user's existing bookmarks so they aren't lost.
  const saveToProfile = activeProfile || targetProfile;
  const saveFolder = await ensureProfileFolder(saveToProfile);
  if (saveFolder && currentItems.length > 0) {
    await clearFolderContents(saveFolder.id);
    for (let i = 0; i < currentItems.length; i++) {
      try {
        await deepCopyBookmarkNode(currentItems[i], saveFolder.id, i);
      } catch (error) {
        // Silently handle copy errors
      }
    }
  }

  // Step 2: Clear the bookmark bar
  for (const item of currentItems) {
    try {
      if (!item.url) {
        await chrome.bookmarks.removeTree(item.id);
      } else {
        await chrome.bookmarks.remove(item.id);
      }
    } catch (error) {
      // Silently handle removal errors
    }
  }

  // Step 3: Copy target profile bookmarks into the bookmark bar
  // (the profile folder keeps its copies intact)
  const targetFolder = await ensureProfileFolder(targetProfile);
  if (targetFolder) {
    const storedItems = await chrome.bookmarks.getChildren(targetFolder.id);
    for (let i = 0; i < storedItems.length; i++) {
      try {
        await deepCopyBookmarkNode(storedItems[i], BOOKMARK_BAR_ID, i);
      } catch (error) {
        // Silently handle copy errors
      }
    }
  }

  // Step 4: Update active profile
  await chrome.storage.sync.set({ activeProfile: targetProfile });
  await updateContextMenu();
}

// Update context menu with current profiles
async function updateContextMenu() {
  await chrome.contextMenus.removeAll();

  const { profiles, profileSettings, activeProfile } = await chrome.storage.sync.get(['profiles', 'profileSettings', 'activeProfile']);

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
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'switchProfile') {
    switchProfile(message.profile).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep channel open for async response
  }

  if (message.action === 'getState') {
    chrome.storage.sync.get(['profiles', 'profileSettings', 'activeProfile']).then(data => {
      sendResponse(data);
    });
    return true;
  }

  if (message.action === 'getBookmarkCount') {
    getBookmarkBarItems().then(items => countBookmarks(items)).then(count => {
      sendResponse({ count });
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

  if (message.action === 'exportBookmarks') {
    chrome.bookmarks.getTree().then(tree => {
      sendResponse({ tree });
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
  const { profiles, profileSettings } = await chrome.storage.sync.get(['profiles', 'profileSettings']);

  if (profiles.includes(profileName)) {
    throw new Error('Profile already exists');
  }

  profiles.push(profileName);

  // Add default settings for new profile
  profileSettings[profileName] = { emoji: '📁', color: '#2196f3' };

  await chrome.storage.sync.set({ profiles, profileSettings });
  await ensureProfileFolder(profileName);
  await updateContextMenu();
}

// Delete a profile
async function deleteProfile(profileName) {
  const { profiles, profileSettings, activeProfile } = await chrome.storage.sync.get(['profiles', 'profileSettings', 'activeProfile']);

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

  await chrome.storage.sync.set({ profiles: updatedProfiles, profileSettings });

  // Delete the folder and its bookmarks
  const profileFolder = await findProfileFolder(profileName);
  if (profileFolder) {
    await chrome.bookmarks.removeTree(profileFolder.id);
  }

  await updateContextMenu();
}

// Rename a profile
async function renameProfile(oldName, newName) {
  const { profiles, profileSettings, activeProfile } = await chrome.storage.sync.get(['profiles', 'profileSettings', 'activeProfile']);

  if (profiles.includes(newName)) {
    throw new Error('A profile with this name already exists');
  }

  // Update profiles list
  const updatedProfiles = profiles.map(p => p === oldName ? newName : p);

  // Transfer settings to new name
  profileSettings[newName] = profileSettings[oldName];
  delete profileSettings[oldName];

  await chrome.storage.sync.set({ profiles: updatedProfiles, profileSettings });

  // Update active profile if it was the renamed one
  if (activeProfile === oldName) {
    await chrome.storage.sync.set({ activeProfile: newName });
  }

  // Rename the folder
  const oldFolder = await findProfileFolder(oldName);
  if (oldFolder) {
    await chrome.bookmarks.update(oldFolder.id, { title: newName });
  }

  await updateContextMenu();
}

// Update profile settings (emoji and color)
async function updateProfileSettings(profileName, settings) {
  const { profileSettings } = await chrome.storage.sync.get(['profileSettings']);

  profileSettings[profileName] = {
    ...profileSettings[profileName],
    ...settings
  };

  await chrome.storage.sync.set({ profileSettings });
  await updateContextMenu();
}

// Reorder profiles
async function reorderProfiles(newOrder) {
  const { profiles } = await chrome.storage.sync.get(['profiles']);

  // Validate that all profiles are present
  if (newOrder.length !== profiles.length || !newOrder.every(p => profiles.includes(p))) {
    throw new Error('Invalid profile order');
  }

  await chrome.storage.sync.set({ profiles: newOrder });
  await updateContextMenu();
}
