# Bookmark Swap — Project Documentation

Bookmark Swap is a Chrome browser extension that lets users manage multiple bookmark bar profiles and instantly switch between them. Instead of a cluttered single bookmark bar, users organize bookmarks into profiles (e.g. "Work", "Personal", "Research") and swap with one click.

---

## ⚠️ Golden Rule — Zero Bookmark Loss

**No bookmarks may be lost or deleted under any circumstances.** This is the single most important invariant of the entire extension. Every code change, feature addition, or refactor **must** preserve this guarantee.

### Principles

1. **Copy, never move.** Bookmarks are always duplicated between the bar and profile folders using `chrome.bookmarks.create()`. The `chrome.bookmarks.move()` API must **never** be used for profile switching.
2. **Profile folders are the source of truth.** Each profile folder under `_BookmarkSwap` always holds a complete copy of that profile's bookmarks. The bookmark bar is a working copy that is rebuilt from the folder on every switch.
3. **Save before clear.** Before the bookmark bar is ever cleared, its contents must first be copied into the appropriate profile folder. No exceptions.
4. **First-switch safety.** On first-ever profile selection (`activeProfile` is `null`), the current bookmark bar is copied into the target profile folder before the swap proceeds, ensuring existing bookmarks are preserved.
5. **Delete guards.** The last remaining profile and the currently active profile cannot be deleted. This prevents a state where no profile exists to hold the user's bookmarks.
6. **Silent error handling.** Individual bookmark copy/remove errors are caught silently so a single failure does not abort the entire operation and leave the bar in an inconsistent state.

### For Contributors

Before merging any change that touches bookmark operations (`switchProfile`, `addProfile`, `deleteProfile`, `renameProfile`, or any function that calls `chrome.bookmarks.*`), verify:

- ✅ No code path can delete bookmarks from the bar without first saving them to a profile folder.
- ✅ No code path can delete a profile folder without explicit user intent (delete action with guards).
- ✅ `chrome.bookmarks.move()` is not used for switching — only `create()` (copy) and `remove()`/`removeTree()` (cleanup).
- ✅ The first-ever switch (no active profile) seeds the target folder with existing bar bookmarks.
- ✅ Re-selecting the active profile works as a safe refresh (re-copies from folder to bar).

---

## Features

- **Profile Switching** — Instantly swap the active bookmark bar; current bookmarks are saved automatically.
- **Profile Management** — Create, rename, delete, and reorder profiles.
- **Custom Emoji** — Assign one of 32 emoji to each profile for quick identification.
- **Custom Colors** — Choose from 18 preset colors or enter a hex code per profile.
- **Context Menu** — Right-click the extension icon for quick profile switching.
- **Drag-and-Drop Reordering** — Reorder profiles on the options page by dragging.
- **Default Profiles** — Pre-configured "Work" 💼 (blue) and "Personal" 🏠 (green) on first install.
- **Active Profile Indicator** — Popup and context menu highlight the current profile.
- **Zero External Dependencies** — Fully self-contained, no network requests.

---

## Architecture

### Data Flow

```
User Interaction (click / context menu)
        │
        ▼
Popup UI  /  Options Page  /  Context Menu
        │
        ▼  chrome.runtime messages
Background Service Worker (background.js)
        │
        ▼
Chrome Bookmarks API  +  Chrome Storage API
        │
        ▼
_BookmarkSwap folder (Other Bookmarks)  +  chrome.storage.local
```

### Component Responsibilities

| Component | Role |
|-----------|------|
| **background.js** | Core logic: profile switching, bookmark moves, storage management, context menu |
| **popup.html / popup.js** | Quick-switch UI shown when clicking the extension icon |
| **options.html / options.js** | Full profile management page (create, rename, delete, reorder, customize) |
| **styles.css** | Shared styles for popup and options page |
| **manifest.json** | Extension metadata, permissions, and component declarations |

### Message Passing

All UI components communicate with the background service worker via `chrome.runtime.sendMessage`. Supported actions:

| Action | Source | Purpose |
|--------|--------|---------|
| `switchProfile` | Popup, Context Menu | Switch the active bookmark profile |
| `getState` | Popup, Options | Retrieve profiles, settings, and active profile |
| `getBookmarkCount` | Popup | Count current bookmark bar items |
| `addProfile` | Options | Create a new profile |
| `deleteProfile` | Options | Remove a profile |
| `renameProfile` | Options | Rename an existing profile |
| `updateProfileSettings` | Options | Update emoji or color for a profile |
| `reorderProfiles` | Options | Persist a new profile order |

---

## Storage

### Chrome Local Storage (Metadata)

```json
{
  "profiles": ["Work", "Personal", "Research"],
  "profileSettings": {
    "Work":     { "emoji": "💼", "color": "#2196f3" },
    "Personal": { "emoji": "🏠", "color": "#4caf50" },
    "Research": { "emoji": "📚", "color": "#ff9800" }
  },
  "activeProfile": "Work",
  "initialized": true
}
```

### Bookmark Folder Structure (Actual Bookmarks)

```
Other Bookmarks
└── _BookmarkSwap          ← hidden storage folder
    ├── Work               ← profile folder
    │   ├── Bookmark 1
    │   └── Bookmark 2
    ├── Personal
    │   ├── Bookmark A
    │   └── Bookmark B
    └── Research
        └── ...
```

- The bookmark bar (Chrome ID `'1'`) always holds a **working copy** of the active profile's bookmarks.
- Each profile folder under `_BookmarkSwap` always retains a **complete copy** of that profile's bookmarks (source of truth).
- On every switch, the bar is saved back to the active folder before loading the new profile — both copies stay in sync.
- `_BookmarkSwap` is filtered from UI views to stay invisible to the user.

---

## How Bookmark Swapping Works

When a user switches from profile **A** to profile **B**:

1. The background worker receives a `switchProfile` message with the target profile name.
2. All current bookmark bar items are retrieved (excluding `_BookmarkSwap`).
3. **Save step:** The bar items are **copied** into the active profile's folder (folder is cleared first, then re-populated). On first-ever switch (`activeProfile` is `null`), the bar items are copied into the **target** profile's folder instead — seeding it with the user's existing bookmarks.
4. The bookmark bar items are deleted (the profile folder still holds the complete copy).
5. All bookmarks inside profile **B**'s storage folder are **copied** to the bookmark bar, preserving their original order. Profile **B**'s folder keeps its bookmarks intact.
6. `activeProfile` is updated in `chrome.storage.local`.
7. The context menu is rebuilt to reflect the new active profile (✓ indicator).

**Re-selecting the active profile** triggers the same flow — acting as a "refresh" that re-syncs the bar from the profile folder.

**Copy-based approach:** Profile folders are the source of truth and always retain their bookmarks. The bookmark bar is a working copy of the active profile. This prevents bookmark loss — even if a switch is interrupted, the profile folder still holds a complete copy.

---

## File Breakdown

### `manifest.json`

Extension configuration using **Manifest V3**.

- Declares `background.js` as the service worker.
- Registers `popup.html` as the browser action popup (300 px wide).
- Registers `options.html` as the options page.
- Requests permissions: `bookmarks`, `storage`, `contextMenus`.
- Provides icons at 16, 48, and 128 px.

### `background.js`

Core service worker containing all business logic.

| Function | Description |
|----------|-------------|
| `chrome.runtime.onInstalled` | Creates default profiles and storage folders on first install |
| `switchProfile(targetProfile)` | Copy-based swap: saves bar → clears bar → copies target folder → bar |
| `deepCopyBookmarkNode(node, parentId, index)` | Recursively copies a bookmark or folder tree to a new parent |
| `clearFolderContents(folderId)` | Removes all children of a folder without deleting the folder itself |
| `ensureStorageFolder()` | Creates or locates the `_BookmarkSwap` folder |
| `ensureProfileFolder(name)` | Creates or locates a profile's subfolder |
| `getBookmarkBarItems()` | Returns bookmark bar children, filtering out `_BookmarkSwap` |
| `addProfile(name)` | Creates a new profile with default emoji (📁) and color (#2196f3) |
| `deleteProfile(name)` | Deletes a profile (blocks if it's the last or active profile) |
| `renameProfile(old, new)` | Renames profile in storage and its bookmark folder |
| `updateProfileSettings(name, settings)` | Updates emoji/color for a profile |
| `reorderProfiles(newOrder)` | Persists a reordered profile list |
| `updateContextMenu()` | Rebuilds the right-click context menu with current profiles |

### `popup.html` / `popup.js`

Quick-access popup shown when clicking the extension icon.

- Displays the active profile name and emoji.
- Renders a colored button for each profile; clicking one triggers a switch.
- The active profile's button is highlighted; clicking it refreshes the profile from the folder.
- Shows a welcome message on first launch (no active profile yet).
- "Manage Profiles" button opens the options page.

### `options.html` / `options.js`

Full profile management page.

- **Profile list**: Each profile shows a drag handle (⋮⋮), emoji, color swatch, name, rename button, and delete button.
- **Emoji picker**: 8-column grid with 32 emoji options.
- **Color picker**: 8-hue × 3-shade grid (24 curated colors) with row labels (Soft, Vivid, Deep), plus a custom hex input with live preview. Selected color is indicated with a ring outline.
- **Add profile**: Text input + button; validates uniqueness and non-empty names.
- **Drag-and-drop**: Profiles can be reordered; order persists via `reorderProfiles` message.
- **Delete safeguard**: Cannot delete the last profile or the currently active profile.
- **Toast notifications**: Success (green) and error (red) messages auto-dismiss after 3 seconds.

### `styles.css`

Shared stylesheet for popup and options page.

- System font stack (Apple system fonts, Segoe UI).
- `.container` (600 px) for options, `.container-narrow` (300 px) for popup.
- `.profile-btn` — colored buttons in the popup.
- `.profile-item` — profile rows in options (flexbox, draggable).
- `.emoji-picker` / `.color-picker` — absolutely positioned picker modals.
- `.message` — toast notification with `.success` / `.error` variants.
- Hover effects use brightness filter and subtle scale transforms.

---

## Permissions

| Permission | Why It's Needed |
|------------|-----------------|
| `bookmarks` | Read, create, move, and delete bookmark bar items and storage folders |
| `storage` | Persist profile metadata (names, emoji, colors, active profile) across sessions |
| `contextMenus` | Provide a right-click menu on the extension icon for quick profile switching |

No network, tabs, or host permissions are required. The extension is fully offline and self-contained.

---

## Chrome APIs Used

| API | Usage |
|-----|-------|
| `chrome.bookmarks` | `getChildren`, `create`, `remove`, `removeTree`, `update` — manage bookmark bar and storage folders (copy-based, never move) |
| `chrome.storage.local` | `get`, `set` — read/write profile metadata |
| `chrome.contextMenus` | `create`, `removeAll`, `onClicked` — build and handle the right-click menu |
| `chrome.runtime` | `sendMessage`, `onMessage`, `onInstalled`, `openOptionsPage` — inter-component messaging and lifecycle events |

---

## Setup & Installation

### Development (Load Unpacked)

1. Clone or download the repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the project folder (`bookmark-swap`).
5. The extension icon appears in the toolbar. Pin it for easy access.

### First Launch

On first install the extension automatically:

- Creates a `_BookmarkSwap` folder in "Other Bookmarks".
- Creates two default profiles: **Work** 💼 and **Personal** 🏠.
- Sets `activeProfile` to `null` (no profile active yet).
- Builds the context menu.

Your current bookmark bar contents remain untouched until you perform your first profile switch. On that first switch, your existing bookmarks are automatically copied into the selected profile — nothing is lost.

### Project Structure

```
bookmark-swap/
├── manifest.json      Extension configuration (Manifest V3)
├── background.js      Service worker — core logic
├── popup.html         Quick-switch popup markup
├── popup.js           Popup behaviour
├── options.html       Profile management page markup
├── options.js         Options page behaviour
├── styles.css         Shared styles
├── icon16.png         Toolbar icon (16 px)
├── icon48.png         Extensions page icon (48 px)
├── icon128.png        Chrome Web Store icon (128 px)
├── icon.psd           Source icon (Photoshop)
├── README.md          Project readme
└── agents.md          This documentation file
```

---

## Validation & Error Handling

- **Zero bookmark loss** — The overriding invariant. All switching uses copy-based operations; profile folders always retain complete bookmark copies.
- **Profile name uniqueness** is enforced on create and rename.
- **Delete guards** prevent removing the last remaining profile or the currently active one.
- **First-switch protection** — When no active profile exists, existing bar bookmarks are copied into the target profile folder before the swap.
- **Hex color validation** accepts only `#RRGGBB` format (`/^#[0-9A-F]{6}$/i`).
- **Bookmark operation errors** are silently caught per-item to avoid aborting mid-switch and leaving the bar in an inconsistent state.
- All background operations use `async`/`await`; message handlers keep the channel open with `return true`.
- **`chrome.bookmarks.move()` is banned** for profile switching — only `create()` (copy) and `remove()`/`removeTree()` (cleanup after save) are used.
