// Export all bookmarks as NETSCAPE HTML
function bookmarkNodeToHTML(node, indent) {
  const pad = '    '.repeat(indent);
  if (node.url) {
    const title = (node.title || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const url = node.url.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    return `${pad}<DT><A HREF="${url}" ADD_DATE="${node.dateAdded ? Math.floor(node.dateAdded / 1000) : 0}">${title}</A>`;
  }
  const title = (node.title || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const children = (node.children || []).map(c => bookmarkNodeToHTML(c, indent + 1)).join('\n');
  return `${pad}<DT><H3>${title}</H3>\n${pad}<DL><p>\n${children}\n${pad}</DL><p>`;
}

async function exportBookmarks() {
  const response = await chrome.runtime.sendMessage({ action: 'exportBookmarks' });
  const root = response.tree[0];
  const childrenHTML = (root.children || []).map(c => bookmarkNodeToHTML(c, 1)).join('\n');
  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
${childrenHTML}
</DL>`;

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bookmarks_${dd}.${mm}.${yy}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// Load and display current state
async function loadState() {
  const response = await chrome.runtime.sendMessage({ action: 'getState' });
  const { profiles, profileSettings, activeProfile } = response;

  // Show first-time message if no active profile
  const firstTimeMessage = document.getElementById('firstTimeMessage');
  const activeCard = document.getElementById('activeCard');
  if (!activeProfile) {
    firstTimeMessage.style.display = 'block';
    activeCard.style.display = 'none';
  } else {
    firstTimeMessage.style.display = 'none';
    activeCard.style.display = 'block';
  }

  // Update active profile card
  if (activeProfile) {
    const settings = profileSettings[activeProfile] || { emoji: '📁', color: '#2196f3' };
    document.getElementById('activeEmoji').textContent = settings.emoji;
    document.getElementById('activeProfileName').textContent = activeProfile;

    // Get bookmark count
    try {
      const count = await getBookmarkCount();
      document.getElementById('bookmarkCount').textContent =
        count === 1 ? '1 bookmark' : `${count} bookmarks`;
    } catch {
      document.getElementById('bookmarkCount').textContent = '—';
    }
  }

  // Populate profile list
  const profileList = document.getElementById('profileList');
  profileList.innerHTML = '';

  profiles.forEach((profile, index) => {
    const settings = profileSettings[profile] || { emoji: '📁', color: '#2196f3' };
    const isActive = profile === activeProfile;

    const button = document.createElement('button');
    button.className = 'profile-card-btn';
    if (index < 9) button.classList.add(`stagger-${index + 1}`);
    button.style.setProperty('--profile-color', settings.color);

    if (isActive) {
      button.classList.add('active');
    }

    const emoji = document.createElement('span');
    emoji.className = 'profile-card-emoji';
    emoji.textContent = settings.emoji;

    const name = document.createElement('span');
    name.className = 'profile-card-name';
    name.textContent = profile;

    const check = document.createElement('span');
    check.className = 'profile-card-check';
    check.textContent = '✓';

    button.appendChild(emoji);
    button.appendChild(name);
    button.appendChild(check);

    button.addEventListener('click', async () => {
      button.classList.add('switching');
      emoji.textContent = '⏳';
      name.textContent = isActive ? 'Refreshing…' : 'Switching…';

      try {
        await chrome.runtime.sendMessage({
          action: 'switchProfile',
          profile: profile
        });
        await loadState();
      } catch (error) {
        alert('Error switching profile: ' + error.message);
        button.classList.remove('switching');
        emoji.textContent = settings.emoji;
        name.textContent = profile;
      }
    });

    profileList.appendChild(button);
  });
}

// Get bookmark count from bar
async function getBookmarkCount() {
  const response = await chrome.runtime.sendMessage({ action: 'getBookmarkCount' });
  return response.count || 0;
}

// Manage profiles button
document.getElementById('manageBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Export button in first-time welcome card
document.getElementById('popupExportBtn').addEventListener('click', exportBookmarks);

// Load state when popup opens
loadState();
