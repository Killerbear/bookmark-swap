// Load and display current state
async function loadState() {
  const response = await chrome.runtime.sendMessage({ action: 'getState' });
  const { profiles, profileSettings, activeProfile } = response;

  // Show first-time message if no active profile
  const firstTimeMessage = document.getElementById('firstTimeMessage');
  if (!activeProfile) {
    firstTimeMessage.style.display = 'block';
  } else {
    firstTimeMessage.style.display = 'none';
  }

  // Update active profile display
  const activeProfileElement = document.getElementById('activeProfile');
  if (activeProfile) {
    const settings = profileSettings[activeProfile] || { emoji: '📁', color: '#2196f3' };
    activeProfileElement.innerHTML = `${settings.emoji} ${activeProfile}`;
  } else {
    activeProfileElement.textContent = 'None';
  }

  // Populate profile list
  const profileList = document.getElementById('profileList');
  profileList.innerHTML = '';

  profiles.forEach(profile => {
    const settings = profileSettings[profile] || { emoji: '📁', color: '#2196f3' };

    const button = document.createElement('button');
    button.className = 'profile-btn';
    button.style.backgroundColor = settings.color;
    button.innerHTML = `${settings.emoji} ${profile}`;

    if (profile === activeProfile) {
      button.classList.add('active');
      button.disabled = true;
    }

    button.addEventListener('click', async () => {
      button.disabled = true;
      button.innerHTML = '⏳ Switching...';

      try {
        await chrome.runtime.sendMessage({
          action: 'switchProfile',
          profile: profile
        });
        // Reload the popup to show updated state
        await loadState();
      } catch (error) {
        alert('Error switching profile: ' + error.message);
        button.disabled = false;
        button.innerHTML = `${settings.emoji} ${profile}`;
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
