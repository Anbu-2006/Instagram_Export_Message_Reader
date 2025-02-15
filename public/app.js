// Global State
let chats = [];
let activeChatId = null;
let activeChatData = null;
let selectMode = false;
let selectedIds = new Set();
let currentExportPath = '';

// DOM Elements — Main App
const appContainerEl = document.getElementById('app-container');
const chatListEl = document.getElementById('chat-list');
const searchInputEl = document.getElementById('search-input');
const welcomeScreenEl = document.getElementById('welcome-screen');
const chatViewEl = document.getElementById('chat-view');

const headerTitleEl = document.getElementById('header-title');
const headerSubtitleEl = document.getElementById('header-subtitle');
const headerAvatarEl = document.getElementById('header-avatar');
const messageListEl = document.getElementById('message-list');
const messageListViewportEl = document.getElementById('message-list-viewport');

// Setup Screen
const setupScreenEl = document.getElementById('setup-screen');
const setupPathInputEl = document.getElementById('setup-path-input');
const setupSubmitBtn = document.getElementById('setup-submit');
const setupErrorEl = document.getElementById('setup-error');

// Current folder info in welcome screen
const currentFolderInfoEl = document.getElementById('current-folder-info');
const currentFolderPathEl = document.getElementById('current-folder-path');

// Switch folder button
const btnSwitchFolderEl = document.getElementById('btn-switch-folder');

// Modals
const renameModalEl = document.getElementById('rename-modal');
const renameInputEl = document.getElementById('rename-input');
const btnRenameEl = document.getElementById('btn-rename');
const renameSaveBtn = document.getElementById('rename-save');
const renameCancelBtn = document.getElementById('rename-cancel');

const deleteModalEl = document.getElementById('delete-modal');
const deleteFolderPathEl = document.getElementById('delete-folder-path');
const btnDeleteEl = document.getElementById('btn-delete');
const deleteConfirmBtn = document.getElementById('delete-confirm');
const deleteCancelBtn = document.getElementById('delete-cancel');

// Select Mode / Bulk elements
const btnSelectModeEl = document.getElementById('btn-select-mode');
const bulkActionBarEl = document.getElementById('bulk-action-bar');
const bulkCountEl = document.getElementById('bulk-count');
const btnSelectAllEl = document.getElementById('btn-select-all');
const btnBulkDeleteEl = document.getElementById('btn-bulk-delete');

const bulkDeleteModalEl = document.getElementById('bulk-delete-modal');
const bulkDeleteCountEl = document.getElementById('bulk-delete-count');
const bulkDeleteListEl = document.getElementById('bulk-delete-list');
const bulkDeleteCancelBtn = document.getElementById('bulk-delete-cancel');
const bulkDeleteConfirmBtn = document.getElementById('bulk-delete-confirm');

// ──────── Initialization ────────
document.addEventListener('DOMContentLoaded', () => {
  // Check config first
  checkConfig();
  
  // Setup screen events
  setupSubmitBtn.addEventListener('click', submitSetup);
  setupPathInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitSetup();
  });

  // Browse Folder button click
  const btnBrowseFolder = document.getElementById('btn-browse-folder');
  if (btnBrowseFolder) {
    btnBrowseFolder.addEventListener('click', browseFolder);
  }

  // Browse ZIP button click
  const btnBrowseZip = document.getElementById('btn-browse-zip');
  if (btnBrowseZip) {
    btnBrowseZip.addEventListener('click', browseZip);
  }

  // Format Option Cards toggle
  const formatHtmlCard = document.getElementById('format-html-card');
  const formatJsonCard = document.getElementById('format-json-card');
  const radioHtml = formatHtmlCard.querySelector('input[value="html"]');
  const radioJson = formatJsonCard.querySelector('input[value="json"]');

  formatHtmlCard.addEventListener('click', () => {
    radioHtml.checked = true;
    formatHtmlCard.classList.add('active');
    formatJsonCard.classList.remove('active');
  });

  formatJsonCard.addEventListener('click', () => {
    radioJson.checked = true;
    formatJsonCard.classList.add('active');
    formatHtmlCard.classList.remove('active');
  });

  // Messages Option Cards toggle
  const checkYesCard = document.getElementById('check-yes-card');
  const checkNoCard = document.getElementById('check-no-card');
  const radioYes = checkYesCard.querySelector('input[value="yes"]');
  const radioNo = checkNoCard.querySelector('input[value="no"]');

  checkYesCard.addEventListener('click', () => {
    radioYes.checked = true;
    checkYesCard.classList.add('active');
    checkNoCard.classList.remove('active');
  });

  checkNoCard.addEventListener('click', () => {
    radioNo.checked = true;
    checkNoCard.classList.add('active');
    checkYesCard.classList.remove('active');
  });

  // Setup validation modals
  const jsonModal = document.getElementById('json-modal');
  const jsonClose = document.getElementById('json-modal-close');
  const messagesRequiredModal = document.getElementById('messages-required-modal');
  const messagesRequiredClose = document.getElementById('messages-required-close');

  jsonClose.addEventListener('click', () => jsonModal.style.display = 'none');
  messagesRequiredClose.addEventListener('click', () => messagesRequiredModal.style.display = 'none');

  // Main app events
  searchInputEl.addEventListener('input', handleSearch);
  btnRenameEl.addEventListener('click', openRenameModal);
  renameCancelBtn.addEventListener('click', closeRenameModal);
  renameSaveBtn.addEventListener('click', saveRename);
  
  btnDeleteEl.addEventListener('click', openDeleteModal);
  deleteCancelBtn.addEventListener('click', closeDeleteModal);
  deleteConfirmBtn.addEventListener('click', confirmDelete);

  // Select mode
  btnSelectModeEl.addEventListener('click', toggleSelectMode);
  btnSelectAllEl.addEventListener('click', toggleSelectAll);
  btnBulkDeleteEl.addEventListener('click', openBulkDeleteModal);
  bulkDeleteCancelBtn.addEventListener('click', closeBulkDeleteModal);
  bulkDeleteConfirmBtn.addEventListener('click', confirmBulkDelete);

  // Switch folder button
  btnSwitchFolderEl.addEventListener('click', showSetupScreen);

  // Mobile back button
  const btnMobileBack = document.getElementById('btn-mobile-back');
  if (btnMobileBack) {
    btnMobileBack.addEventListener('click', () => {
      const sidebar = document.querySelector('.sidebar');
      sidebar.classList.remove('hidden-mobile');
    });
  }

  // Enter key on rename input
  renameInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveRename();
  });

  // Close modals on clicking overlay
  [renameModalEl, deleteModalEl, bulkDeleteModalEl, jsonModal, messagesRequiredModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeRenameModal();
        closeDeleteModal();
        closeBulkDeleteModal();
        jsonModal.style.display = 'none';
        messagesRequiredModal.style.display = 'none';
      }
    });
  });
});

// Browse folder via native OS dialog
async function browseFolder() {
  const btnBrowse = document.getElementById('btn-browse-folder');
  btnBrowse.disabled = true;
  const originalHtml = btnBrowse.innerHTML;
  btnBrowse.innerHTML = `
    <div class="loading-spinner" style="width:12px;height:12px;border-width:1.5px;margin-right:0;animation:spin 0.8s linear infinite;"></div>
    Opening...
  `;
  
  try {
    const response = await fetch('/api/browse-folder');
    if (!response.ok) throw new Error('Failed to browse folder');
    const result = await response.json();
    if (result.selectedPath) {
      setupPathInputEl.value = result.selectedPath;
    }
  } catch (err) {
    console.error('Error selecting folder:', err);
    alert('Failed to launch folder selector. Please enter the path manually.');
  } finally {
    btnBrowse.disabled = false;
    btnBrowse.innerHTML = originalHtml;
  }
}

// Browse ZIP file via native OS dialog
async function browseZip() {
  const btnBrowse = document.getElementById('btn-browse-zip');
  btnBrowse.disabled = true;
  const originalHtml = btnBrowse.innerHTML;
  btnBrowse.innerHTML = `
    <div class="loading-spinner" style="width:12px;height:12px;border-width:1.5px;margin-right:0;animation:spin 0.8s linear infinite;"></div>
    Opening...
  `;
  
  try {
    const response = await fetch('/api/browse-folder?type=zip');
    if (!response.ok) throw new Error('Failed to browse ZIP archive');
    const result = await response.json();
    if (result.selectedPath) {
      setupPathInputEl.value = result.selectedPath;
    }
  } catch (err) {
    console.error('Error selecting ZIP archive:', err);
    alert('Failed to launch ZIP file selector. Please enter the path manually.');
  } finally {
    btnBrowse.disabled = false;
    btnBrowse.innerHTML = originalHtml;
  }
}

// ──────── Config / Setup Flow ────────

async function checkConfig() {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();

    if (config.exportPath) {
      currentExportPath = config.exportPath;
      showMainApp();
      loadChats();
    } else {
      showSetupScreen();
    }
  } catch (err) {
    console.error('Error checking config:', err);
    showSetupScreen();
  }
}

function showSetupScreen() {
  setupScreenEl.style.display = 'flex';
  appContainerEl.style.display = 'none';
  
  // Pre-fill with current path if available
  if (currentExportPath) {
    setupPathInputEl.value = currentExportPath;
  }
  
  setupErrorEl.style.display = 'none';
  setTimeout(() => setupPathInputEl.focus(), 200);
}

function showMainApp() {
  setupScreenEl.style.display = 'none';
  appContainerEl.style.display = 'flex';
  
  // Show current folder info in welcome screen
  if (currentExportPath) {
    currentFolderInfoEl.style.display = 'flex';
    // Show just the folder name for cleaner display
    const folderName = currentExportPath.split(/[\/\\]/).filter(Boolean).pop();
    currentFolderPathEl.textContent = folderName;
    currentFolderPathEl.title = currentExportPath;
  }
}

async function submitSetup() {
  // Check export format
  const formatVal = document.querySelector('input[name="export-format"]:checked').value;

  // Check messages option
  const messagesVal = document.querySelector('input[name="messages-included"]:checked').value;
  if (messagesVal === 'no') {
    document.getElementById('messages-required-modal').style.display = 'flex';
    return;
  }

  const pathValue = setupPathInputEl.value.trim();
  
  if (!pathValue) {
    showSetupError('Please enter a folder path.');
    return;
  }
  
  // Disable button while loading
  setupSubmitBtn.disabled = true;
  setupSubmitBtn.innerHTML = `
    <div class="loading-spinner" style="width:16px;height:16px;border-width:2px;"></div>
    Validating...
  `;
  setupErrorEl.style.display = 'none';
  
  try {
    const response = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exportPath: pathValue, format: formatVal })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      showSetupError(result.error || 'Invalid path');
      return;
    }
    
    // Success!
    currentExportPath = result.exportPath;
    showMainApp();
    loadChats();
    
  } catch (err) {
    showSetupError(`Connection error: ${err.message}`);
  } finally {
    setupSubmitBtn.disabled = false;
    setupSubmitBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      Load Conversations
    `;
  }
}

function showSetupError(message) {
  setupErrorEl.textContent = message;
  setupErrorEl.style.display = 'flex';
}

// Load chats from API
async function loadChats() {
  try {
    chatListEl.innerHTML = '<li class="loading-state"><div class="loading-spinner"></div>Loading chats...</li>';
    const response = await fetch('/api/chats');
    if (!response.ok) throw new Error('Failed to fetch chat list');
    chats = await response.json();
    renderChatList(chats);
  } catch (err) {
    console.error(err);
    chatListEl.innerHTML = `<li class="empty-state">Error loading chats: ${err.message}</li>`;
  }
}

// ──────── Select Mode ────────

function toggleSelectMode() {
  selectMode = !selectMode;
  selectedIds.clear();
  btnSelectModeEl.classList.toggle('active', selectMode);
  bulkActionBarEl.style.display = selectMode ? 'flex' : 'none';
  updateBulkUI();
  renderChatList(getFilteredChats());
}

function toggleSelectAll() {
  const visibleChats = getFilteredChats();
  const allSelected = visibleChats.every(c => selectedIds.has(c.id));
  
  if (allSelected) {
    // Deselect all
    visibleChats.forEach(c => selectedIds.delete(c.id));
    btnSelectAllEl.textContent = 'Select All';
  } else {
    // Select all visible
    visibleChats.forEach(c => selectedIds.add(c.id));
    btnSelectAllEl.textContent = 'Deselect All';
  }
  updateBulkUI();
  renderChatList(visibleChats);
}

function toggleChatSelection(chatId) {
  if (selectedIds.has(chatId)) {
    selectedIds.delete(chatId);
  } else {
    selectedIds.add(chatId);
  }
  updateBulkUI();
  
  // Update just the affected item instead of full re-render
  const li = chatListEl.querySelector(`li[data-id="${CSS.escape(chatId)}"]`);
  if (li) {
    li.classList.toggle('selected', selectedIds.has(chatId));
    const checkbox = li.querySelector('.chat-item-checkbox');
    if (checkbox) checkbox.classList.toggle('checked', selectedIds.has(chatId));
  }
}

function updateBulkUI() {
  const count = selectedIds.size;
  bulkCountEl.textContent = count;
  btnBulkDeleteEl.disabled = count === 0;
  
  // Update Select All button text
  const visibleChats = getFilteredChats();
  const allSelected = visibleChats.length > 0 && visibleChats.every(c => selectedIds.has(c.id));
  btnSelectAllEl.textContent = allSelected ? 'Deselect All' : 'Select All';
}

function getFilteredChats() {
  const query = searchInputEl.value.toLowerCase().trim();
  if (!query) return chats;
  return chats.filter(chat => 
    chat.displayName.toLowerCase().includes(query) || 
    chat.id.toLowerCase().includes(query) ||
    chat.lastMessage.toLowerCase().includes(query)
  );
}

// ──────── Bulk Delete ────────

function openBulkDeleteModal() {
  if (selectedIds.size === 0) return;
  
  bulkDeleteCountEl.textContent = selectedIds.size;
  bulkDeleteListEl.innerHTML = '';
  
  selectedIds.forEach(id => {
    const chat = chats.find(c => c.id === id);
    if (!chat) return;
    const item = document.createElement('div');
    item.className = 'bulk-delete-item';
    item.innerHTML = `
      <span class="delete-item-name">${escapeHTML(chat.displayName)}</span>
      <span class="delete-item-path">${escapeHTML(chat.id)}</span>
    `;
    bulkDeleteListEl.appendChild(item);
  });
  
  bulkDeleteModalEl.style.display = 'flex';
}

function closeBulkDeleteModal() {
  bulkDeleteModalEl.style.display = 'none';
}

async function confirmBulkDelete() {
  const idsToDelete = [...selectedIds];
  const total = idsToDelete.length;
  
  // Add progress bar
  bulkDeleteConfirmBtn.disabled = true;
  bulkDeleteConfirmBtn.textContent = `Deleting... 0/${total}`;
  
  let deleted = 0;
  let errors = [];
  
  for (const id of idsToDelete) {
    try {
      const response = await fetch(`/api/chats/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed');
      }
      deleted++;
    } catch (err) {
      errors.push({ id, error: err.message });
    }
    bulkDeleteConfirmBtn.textContent = `Deleting... ${deleted + errors.length}/${total}`;
  }
  
  // Reset
  bulkDeleteConfirmBtn.disabled = false;
  bulkDeleteConfirmBtn.textContent = 'Yes, Delete All Selected';
  closeBulkDeleteModal();
  
  // Clear selection and reload
  selectedIds.clear();
  activeChatId = null;
  activeChatData = null;
  chatViewEl.style.display = 'none';
  welcomeScreenEl.style.display = 'flex';
  // Restore sidebar on mobile
  document.querySelector('.sidebar').classList.remove('hidden-mobile');
  
  await loadChats();
  updateBulkUI();
  
  if (errors.length > 0) {
    alert(`Deleted ${deleted} chats. ${errors.length} failed:\n${errors.map(e => e.id).join('\n')}`);
  }
}

// ──────── Render Chat Sidebar ────────

function renderChatList(listToRender) {
  if (listToRender.length === 0) {
    chatListEl.innerHTML = '<li class="empty-state">No matching chats found</li>';
    return;
  }

  chatListEl.innerHTML = '';

  // Group by section
  const groups = {};
  listToRender.forEach(chat => {
    const key = chat.section || 'inbox';
    if (!groups[key]) groups[key] = { label: chat.sectionLabel || key, items: [] };
    groups[key].items.push(chat);
  });

  // Render each section group
  Object.entries(groups).forEach(([sectionKey, group]) => {
    // Section header
    const headerLi = document.createElement('li');
    headerLi.className = 'section-header';
    headerLi.innerHTML = `<span class="section-label">${escapeHTML(group.label)}</span><span class="section-count">${group.items.length}</span>`;
    chatListEl.appendChild(headerLi);

    // Chat items
    group.items.forEach(chat => {
      const li = document.createElement('li');
      const isSelected = selectedIds.has(chat.id);
      li.className = `chat-item ${activeChatId === chat.id ? 'active' : ''} ${isSelected ? 'selected' : ''}`;
      li.dataset.id = chat.id;

      const initials = getInitials(chat.displayName);

      // Build inner HTML
      let checkboxHtml = '';
      if (selectMode) {
        checkboxHtml = `<div class="chat-item-checkbox ${isSelected ? 'checked' : ''}"></div>`;
      }

      li.innerHTML = `
        ${checkboxHtml}
        <div class="avatar gradient-circle">${initials}</div>
        <div class="chat-item-details">
          <div class="chat-item-header">
            <span class="chat-item-name">${escapeHTML(chat.displayName)}</span>
            <span class="chat-item-time">${formatTimePreview(chat.timestamp)}</span>
          </div>
          <div class="chat-item-preview">${escapeHTML(chat.lastMessage)}</div>
        </div>
      `;

      li.addEventListener('click', () => {
        if (selectMode) {
          toggleChatSelection(chat.id);
        } else {
          selectChat(chat.id);
        }
      });
      chatListEl.appendChild(li);
    });
  });
}

// Select active chat and load history
async function selectChat(id) {
  activeChatId = id;
  
  // Highlight active item
  document.querySelectorAll('.chat-item').forEach(item => {
    item.classList.toggle('active', item.dataset.id === id);
  });

  try {
    messageListEl.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div>Loading messages...</div>';
    welcomeScreenEl.style.display = 'none';
    chatViewEl.style.display = 'flex';

    // On mobile: hide sidebar to show chat area
    const sidebar = document.querySelector('.sidebar');
    if (window.innerWidth <= 768) {
      sidebar.classList.add('hidden-mobile');
    }
    
    const response = await fetch(`/api/chats/${id}`);
    if (!response.ok) throw new Error('Failed to fetch chat messages');
    
    activeChatData = await response.json();
    
    headerTitleEl.textContent = activeChatData.displayName;
    headerAvatarEl.textContent = getInitials(activeChatData.displayName);
    headerSubtitleEl.textContent = `${activeChatData.messages.length} messages · ${id}`;
    
    renderMessages(activeChatData.messages, activeChatData.displayName, activeChatData.id);
  } catch (err) {
    console.error(err);
    messageListEl.innerHTML = `<div class="empty-state">Error loading chat: ${err.message}</div>`;
  }
}

// Render Messages bubble stream
function renderMessages(messages, participantName, compoundId) {
  messageListEl.innerHTML = '';
  
  if (messages.length === 0) {
    messageListEl.innerHTML = '<div class="empty-state">No messages in this chat thread</div>';
    return;
  }

  const senderCounts = {};
  messages.forEach(m => {
    const s = m.sender;
    senderCounts[s] = (senderCounts[s] || 0) + 1;
  });
  const cleanParticipant = participantName.toLowerCase().trim();

  let lastDateStr = '';

  messages.forEach(msg => {
    if (msg.timestamp) {
      const msgDateStr = formatDateDivider(msg.timestamp);
      if (msgDateStr !== lastDateStr) {
        const divider = document.createElement('div');
        divider.className = 'date-divider';
        divider.innerHTML = `<span class="date-text">${msgDateStr}</span>`;
        messageListEl.appendChild(divider);
        lastDateStr = msgDateStr;
      }
    }

    const cleanSender = msg.sender.toLowerCase().trim();
    const isIncoming = cleanSender === cleanParticipant || 
                       cleanParticipant.includes(cleanSender) ||
                       cleanSender.includes(cleanParticipant);

    const messageRow = document.createElement('div');
    messageRow.className = `message-row ${isIncoming ? 'incoming' : 'outgoing'}`;

    const wrapper = document.createElement('div');
    wrapper.className = 'message-bubble-wrapper';

    const uniqueSenders = Object.keys(senderCounts);
    if (uniqueSenders.length > 2) {
      const senderLabel = document.createElement('span');
      senderLabel.className = 'message-sender';
      senderLabel.textContent = msg.sender;
      wrapper.appendChild(senderLabel);
    }

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.innerHTML = msg.content;
    
    if (msg.timestamp) {
      const timeSpan = document.createElement('span');
      timeSpan.className = 'message-time';
      timeSpan.textContent = formatTimeOnly(msg.timestamp);
      bubble.appendChild(timeSpan);
    }

    wrapper.appendChild(bubble);

    if (msg.reactions && msg.reactions.length > 0) {
      const reactionList = document.createElement('div');
      reactionList.className = 'reaction-list';
      msg.reactions.forEach(react => {
        const span = document.createElement('span');
        span.textContent = react;
        reactionList.appendChild(span);
      });
      wrapper.appendChild(reactionList);
    }

    messageRow.appendChild(wrapper);
    messageListEl.appendChild(messageRow);
  });

  scrollToBottom();
}

// Search Filter
function handleSearch(e) {
  const filtered = getFilteredChats();
  renderChatList(filtered);
}

// ──────── Single Chat Rename/Delete ────────

function openRenameModal() {
  if (!activeChatData) return;
  renameInputEl.value = activeChatData.displayName;
  renameModalEl.style.display = 'flex';
  setTimeout(() => renameInputEl.focus(), 100);
}

function closeRenameModal() {
  renameModalEl.style.display = 'none';
}

async function saveRename() {
  const newName = renameInputEl.value.trim();
  if (!newName) return;

  try {
    const response = await fetch(`/api/chats/${activeChatId}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newName })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to rename chat');
    }

    const result = await response.json();
    closeRenameModal();
    activeChatId = result.newId;
    await loadChats();
    selectChat(result.newId);
  } catch (err) {
    alert(`Error renaming: ${err.message}`);
  }
}

function openDeleteModal() {
  if (!activeChatData) return;
  deleteFolderPathEl.textContent = `/your_instagram_activity/messages/${activeChatData.id}`;
  deleteModalEl.style.display = 'flex';
}

function closeDeleteModal() {
  deleteModalEl.style.display = 'none';
}

async function confirmDelete() {
  try {
    const response = await fetch(`/api/chats/${activeChatId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to delete chat');
    }

    closeDeleteModal();
    activeChatId = null;
    activeChatData = null;
    
    chatViewEl.style.display = 'none';
    welcomeScreenEl.style.display = 'flex';
    // Restore sidebar on mobile
    document.querySelector('.sidebar').classList.remove('hidden-mobile');
    
    await loadChats();
  } catch (err) {
    alert(`Error deleting chat: ${err.message}`);
  }
}

// ──────── Helpers ────────

function getInitials(name) {
  if (!name) return '?';
  const cleanName = name.replace(/[^\w\s]/g, '').trim();
  if (!cleanName) return name.substring(0, 1).toUpperCase();
  
  const parts = cleanName.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return cleanName.substring(0, 2).toUpperCase();
}

function formatTimePreview(timestampStr) {
  if (!timestampStr) return '';
  const date = new Date(timestampStr);
  if (isNaN(date.getTime())) return timestampStr;

  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatDateDivider(timestampStr) {
  if (!timestampStr) return '';
  const date = new Date(timestampStr);
  if (isNaN(date.getTime())) return timestampStr;
  return date.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTimeOnly(timestampStr) {
  if (!timestampStr) return '';
  const date = new Date(timestampStr);
  if (isNaN(date.getTime())) return timestampStr;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function scrollToBottom() {
  setTimeout(() => {
    messageListViewportEl.scrollTop = messageListViewportEl.scrollHeight;
  }, 50);
}
