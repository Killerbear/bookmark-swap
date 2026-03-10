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

// Load state when popup opens
loadState();
