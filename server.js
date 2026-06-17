const express = require('express');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const app = express();
const PORT = 3000;

app.use(express.json());

// Serve public static files for frontend
app.use(express.static(path.join(__dirname, 'public')));

// ──────── Dynamic Config ────────

const configPath = path.join(__dirname, 'config.json');
const customNamesPath = path.join(__dirname, 'custom_names.json');

function getConfig() {
  const defaultConfig = { exportPath: '', format: 'html' };
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return { ...defaultConfig, ...config };
    } catch (e) {
      return defaultConfig;
    }
  }
  return defaultConfig;
}

function saveConfig(config) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

function decodeInstagramString(str) {
  if (typeof str !== 'string') return str;
  try {
    return Buffer.from(str, 'latin1').toString('utf8');
  } catch (e) {
    return str;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Returns the resolved messages root for the currently configured export path
function getMessagesRoot() {
  const config = getConfig();
  if (!config.exportPath) return null;
  return path.join(config.exportPath, 'your_instagram_activity', 'messages');
}

// Searches recursively for your_instagram_activity/messages folder under startPath
function findMessagesRoot(startPath) {
  try {
    const resolved = path.resolve(startPath);
    
    // 1. Direct match: starts/ends at messages
    if (resolved.endsWith(path.join('your_instagram_activity', 'messages')) && fs.existsSync(resolved)) {
      return resolved;
    }
    
    // 2. Selected your_instagram_activity
    if (resolved.endsWith('your_instagram_activity')) {
      const testPath = path.join(resolved, 'messages');
      if (fs.existsSync(testPath)) return testPath;
    }
    
    // 3. User selected parent export folder
    const directMessages = path.join(resolved, 'your_instagram_activity', 'messages');
    if (fs.existsSync(directMessages)) {
      return directMessages;
    }
    
    // 4. Check subdirectories one level down (non-recursive to avoid performance hits)
    if (fs.existsSync(resolved)) {
      const items = fs.readdirSync(resolved);
      for (const item of items) {
        const subPath = path.join(resolved, item);
        if (fs.statSync(subPath).isDirectory()) {
          const testPath = path.join(subPath, 'your_instagram_activity', 'messages');
          if (fs.existsSync(testPath)) {
            return testPath;
          }
        }
      }
    }
  } catch (e) {
    console.error('Error finding messages root:', e);
  }
  return null;
}

// All chat sections to scan (each is a subfolder of messagesRoot that contains chat folders)
const CHAT_SECTIONS = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'message_requests', label: 'Requests' }
];

// ──────── Dynamic Static File Serving ────────
// We use a middleware that serves files from the currently configured export path

app.use('/your_instagram_activity', (req, res, next) => {
  const config = getConfig();
  if (!config.exportPath) return res.status(404).send('No export path configured');
  express.static(path.join(config.exportPath, 'your_instagram_activity'))(req, res, next);
});

app.use('/messages', (req, res, next) => {
  const config = getConfig();
  if (!config.exportPath) return res.status(404).send('No export path configured');
  express.static(path.join(config.exportPath, 'your_instagram_activity', 'messages'))(req, res, next);
});

app.use('/files', (req, res, next) => {
  const config = getConfig();
  if (!config.exportPath) return res.status(404).send('No export path configured');
  express.static(path.join(config.exportPath, 'files'))(req, res, next);
});

// ──────── Config API ────────

// GET /api/config — return current configuration
app.get('/api/config', (req, res) => {
  const config = getConfig();
  res.json({ exportPath: config.exportPath || '', format: config.format || 'html' });
});

// POST /api/config — set the export path (with validation)
app.post('/api/config', (req, res) => {
  const { exportPath, format } = req.body;

  if (!exportPath || !exportPath.trim()) {
    return res.status(400).json({ error: 'exportPath is required' });
  }

  let cleanPath = exportPath.trim();

  // Validate ZIP file and extract
  const isZip = cleanPath.toLowerCase().endsWith('.zip');
  if (isZip) {
    if (!fs.existsSync(cleanPath)) {
      return res.status(400).json({ error: `ZIP file does not exist: ${cleanPath}` });
    }

    const destPath = cleanPath.slice(0, -4); // remove .zip
    const testMessagesPath = path.join(destPath, 'your_instagram_activity', 'messages');

    if (fs.existsSync(testMessagesPath)) {
      console.log(`ℹ️ Extraction skipped (already extracted): ${destPath}`);
      cleanPath = destPath;
    } else {
      try {
        console.log(`📦 Extracting ZIP archive: ${cleanPath} to ${destPath}`);
        fs.mkdirSync(destPath, { recursive: true });
        
        const { execSync } = require('child_process');
        execSync(`tar -xf "${cleanPath}" -C "${destPath}"`);
        console.log(`✅ Extraction complete!`);
        cleanPath = destPath;
      } catch (err) {
        console.error('❌ Error extracting ZIP:', err);
        return res.status(500).json({ error: `Failed to extract ZIP: ${err.message}` });
      }
    }
  }

  // Validate: check that the path exists (now pointing to the extracted folder or folder path)
  if (!fs.existsSync(cleanPath)) {
    return res.status(400).json({ error: `Path does not exist: ${cleanPath}` });
  }

  // Auto-resolve messages directory under this path
  const messagesPath = findMessagesRoot(cleanPath);
  if (!messagesPath) {
    return res.status(400).json({ error: `Not a valid Instagram export. Could not find 'your_instagram_activity/messages' inside or under: ${cleanPath}` });
  }

  // Define the base export path (parent of your_instagram_activity)
  const resolvedExportPath = path.dirname(path.dirname(messagesPath));

  // Check that at least one section exists
  let hasSections = false;
  for (const section of CHAT_SECTIONS) {
    if (fs.existsSync(path.join(messagesPath, section.key))) {
      hasSections = true;
      break;
    }
  }
  // Also check for AI conversations
  if (!hasSections && (fs.existsSync(path.join(messagesPath, 'ai_conversations')) || fs.existsSync(path.join(messagesPath, 'ai_conversations.json')))) {
    hasSections = true;
  }

  if (!hasSections) {
    return res.status(400).json({ error: 'No message sections found (inbox, message_requests, or ai_conversations). Is this the correct folder?' });
  }

  // Save config
  const config = getConfig();
  config.exportPath = resolvedExportPath;
  if (format) {
    config.format = format;
  }
  saveConfig(config);

  // Return summary
  let chatCount = 0;
  CHAT_SECTIONS.forEach(s => {
    const p = path.join(messagesPath, s.key);
    if (fs.existsSync(p)) {
      chatCount += fs.readdirSync(p).filter(f => fs.statSync(path.join(p, f)).isDirectory()).length;
    }
  });

  const chosenFormat = format || config.format || 'html';
  if (chosenFormat === 'json') {
    const aiJsonPath = path.join(messagesPath, 'ai_conversations.json');
    if (fs.existsSync(aiJsonPath)) {
      try {
        const aiChats = JSON.parse(fs.readFileSync(aiJsonPath, 'utf8'));
        chatCount += aiChats.length;
      } catch (e) {
        console.error('Error reading ai_conversations.json for count:', e);
      }
    }
  } else {
    const aiP = path.join(messagesPath, 'ai_conversations');
    if (fs.existsSync(aiP)) {
      chatCount += fs.readdirSync(aiP).filter(f => f.endsWith('.html')).length;
    }
  }

  console.log(`✅ Export path configured: ${resolvedExportPath} (Format: ${chosenFormat})`);
  console.log(`   Found ${chatCount} total chats`);

  res.json({ success: true, exportPath: resolvedExportPath, chatCount });
});

// GET /api/browse-folder — launch folder/file browser dialog using PowerShell (Windows)
app.get('/api/browse-folder', (req, res) => {
  const { exec } = require('child_process');
  const type = req.query.type;
  
  let psScript;
  if (type === 'zip') {
    // OpenFileDialog for zip files
    psScript = `
      Add-Type -AssemblyName System.Windows.Forms;
      $f = New-Object System.Windows.Forms.OpenFileDialog;
      $f.Filter = 'ZIP archives (*.zip)|*.zip|All files (*.*)|*.*';
      $f.Title = 'Select your Instagram Export ZIP Archive';
      $result = $f.ShowDialog();
      if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
          Write-Output $f.FileName;
      }
    `;
  } else {
    // FolderBrowserDialog for folders
    psScript = `
      Add-Type -AssemblyName System.Windows.Forms;
      $f = New-Object System.Windows.Forms.FolderBrowserDialog;
      $f.Description = 'Select your Instagram Export Folder';
      $f.ShowNewFolderButton = $false;
      $result = $f.ShowDialog();
      if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
          Write-Output $f.SelectedPath;
      }
    `;
  }

  const psCommand = psScript.replace(/\n/g, ' ').replace(/"/g, '\\"');

  exec(`powershell -NoProfile -STA -Command "${psCommand}"`, (err, stdout, stderr) => {
    if (err) {
      console.error('Error invoking dialog:', err);
      console.error('PowerShell stderr:', stderr);
      return res.status(500).json({ error: 'Failed to launch dialog picker' });
    }
    const selectedPath = stdout.trim();
    res.json({ selectedPath });
  });
});

// ──────── Helpers ────────

function getCustomNames() {
  if (fs.existsSync(customNamesPath)) {
    try {
      return JSON.parse(fs.readFileSync(customNamesPath, 'utf8'));
    } catch (e) {
      console.error('Error parsing custom names:', e);
      return {};
    }
  }
  return {};
}

function saveCustomNames(names) {
  try {
    fs.writeFileSync(customNamesPath, JSON.stringify(names, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving custom names:', e);
  }
}

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractDivContent(html, className) {
  const startTag = `<div class="${className}">`;
  const idx = html.indexOf(startTag);
  if (idx === -1) return null;
  
  const contentStart = idx + startTag.length;
  let depth = 1;
  let cursor = contentStart;
  
  while (depth > 0 && cursor < html.length) {
    const nextOpen = html.indexOf('<div', cursor);
    const nextClose = html.indexOf('</div', cursor);
    
    if (nextClose === -1) {
      break;
    }
    
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      cursor = nextOpen + 4;
    } else {
      depth--;
      cursor = nextClose + 6;
    }
  }
  
  if (depth === 0) {
    return html.substring(contentStart, cursor - 6);
  }
  return null;
}

function cleanFolderName(name) {
  return name.replace(/[\\\/:\*\?"<>\|]/g, '').trim();
}

function readFirstBytes(filePath, numBytes) {
  const buffer = Buffer.alloc(numBytes);
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const bytesRead = fs.readSync(fd, buffer, 0, numBytes, 0);
    return buffer.toString('utf8', 0, bytesRead);
  } catch (err) {
    return '';
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (e) {}
    }
  }
}

// Resolve a compound chat id ("section/folder") to the absolute path on disk
function resolveChatPath(compoundId) {
  const messagesRoot = getMessagesRoot();
  if (!messagesRoot) return null;

  const slashIdx = compoundId.indexOf('/');
  if (slashIdx === -1) return null;
  const section = compoundId.substring(0, slashIdx);
  const folder = compoundId.substring(slashIdx + 1);
  // Security: prevent path traversal
  if (section.includes('..') || folder.includes('..')) return null;
  const sectionPath = path.join(messagesRoot, section);
  if (!fs.existsSync(sectionPath)) return null;
  return { section, folder, folderPath: path.join(sectionPath, folder), sectionPath };
}

// ──────── API Endpoints ────────

// Helper to parse a folder-based JSON chat thread for listing
function parseFolderChatJson(sectionKey, sectionLabel, folder, folderPath, customNames) {
  const files = fs.readdirSync(folderPath).filter(f => f.startsWith('message_') && f.endsWith('.json'));
  if (files.length === 0) return null;

  const message1Path = path.join(folderPath, 'message_1.json');
  let displayName = folder;
  let lastMessage = 'No messages';
  let timestamp = '';
  let sender = '';

  if (fs.existsSync(message1Path)) {
    try {
      const json = JSON.parse(fs.readFileSync(message1Path, 'utf8'));
      
      if (json.title) {
        displayName = decodeInstagramString(json.title);
      }

      // Fallback: If displayName is missing, empty, or is a numeric string (often representing an ID),
      // construct the name from participant names.
      const isNumeric = /^\d+$/.test(displayName);
      if ((!displayName || displayName === folder || isNumeric) && json.participants && json.participants.length > 0) {
        const participantNames = json.participants
          .map(p => decodeInstagramString(p.name || ''))
          .filter(name => name && name.trim())
          .join(', ');
        if (participantNames) {
          displayName = participantNames;
        }
      }
      
      if (json.messages && json.messages.length > 0) {
        const firstMsg = json.messages[0];
        sender = decodeInstagramString(firstMsg.sender_name || '');
        
        if (firstMsg.content) {
          lastMessage = decodeInstagramString(firstMsg.content);
        } else if (firstMsg.photos && firstMsg.photos.length > 0) {
          lastMessage = `${sender} sent a photo`;
        } else if (firstMsg.videos && firstMsg.videos.length > 0) {
          lastMessage = `${sender} sent a video`;
        } else if (firstMsg.audio_files && firstMsg.audio_files.length > 0) {
          lastMessage = `${sender} sent a voice message`;
        } else if (firstMsg.share) {
          lastMessage = `${sender} shared a link`;
        } else {
          lastMessage = 'Sent an attachment';
        }
        
        if (lastMessage.length > 60) {
          lastMessage = lastMessage.substring(0, 60) + '...';
        }
        
        timestamp = new Date(firstMsg.timestamp_ms).toString();
      }
    } catch (e) {
      console.error(`Error parsing JSON chat preview for ${folder}:`, e);
    }
  }

  const compoundId = `${sectionKey}/${folder}`;
  if (customNames[compoundId]) {
    displayName = customNames[compoundId];
  }

  return {
    id: compoundId,
    section: sectionKey,
    sectionLabel,
    displayName,
    originalName: displayName,
    lastMessage,
    lastSender: sender,
    timestamp,
    fileCount: files.length
  };
}

// Helper to parse a folder-based chat thread for listing
function parseFolderChat(sectionKey, sectionLabel, folder, folderPath, customNames) {
  const files = fs.readdirSync(folderPath).filter(f => f.startsWith('message_') && f.endsWith('.html'));
  if (files.length === 0) return null;

  const message1Path = path.join(folderPath, 'message_1.html');
  let displayName = folder;
  let lastMessage = 'No messages';
  let timestamp = '';
  let sender = '';

  if (fs.existsSync(message1Path)) {
    const html = readFirstBytes(message1Path, 30 * 1024);

    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
      displayName = titleMatch[1].trim().replace(/&#064;/g, '@');
    }

    const senderMatch = html.match(/<h2 class="_3-95 _2pim _a6-h _a6-i">([\s\S]*?)<\/h2>/i);
    if (senderMatch) {
      sender = senderMatch[1].trim();
    }

    const bodyContent = extractDivContent(html, '_3-95 _a6-p');
    if (bodyContent !== null) {
      const cleanText = stripHtml(bodyContent);
      lastMessage = cleanText || 'Sent an attachment';
      if (lastMessage.length > 60) lastMessage = lastMessage.substring(0, 60) + '...';
    }

    const timeMatch = html.match(/<div class="_3-94 _a6-o">([\s\S]*?)<\/div>/i);
    if (timeMatch) {
      timestamp = timeMatch[1].trim();
    }
  }

  const compoundId = `${sectionKey}/${folder}`;
  if (customNames[compoundId]) {
    displayName = customNames[compoundId];
  }

  return {
    id: compoundId,
    section: sectionKey,
    sectionLabel,
    displayName,
    originalName: displayName,
    lastMessage,
    lastSender: sender,
    timestamp,
    fileCount: files.length
  };
}

// Helper to parse an AI conversation (single loose HTML file)
function parseAiConversation(fileName, filePath, customNames) {
  const compoundId = `ai_conversations/${fileName}`;
  let displayName = fileName.replace('.html', '').replace(/threadformailbox\d+_/, 'AI Chat ');
  let lastMessage = 'AI conversation';
  let timestamp = '';
  let sender = 'Meta AI';

  try {
    const html = readFirstBytes(filePath, 30 * 1024);

    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
      const rawTitle = titleMatch[1].trim();
      if (rawTitle && rawTitle !== 'Chats') displayName = rawTitle;
    }

    const bodyContent = extractDivContent(html, '_3-95 _a6-p');
    if (bodyContent !== null) {
      const cleanText = stripHtml(bodyContent);
      lastMessage = cleanText || 'AI conversation';
      if (lastMessage.length > 60) lastMessage = lastMessage.substring(0, 60) + '...';
    }

    const timeMatch = html.match(/<div class="_3-94 _a6-o">([\s\S]*?)<\/div>/i);
    if (timeMatch) {
      timestamp = timeMatch[1].trim();
    }
  } catch (e) {
    // ignore parse errors for AI conversations
  }

  if (customNames[compoundId]) {
    displayName = customNames[compoundId];
  }

  return {
    id: compoundId,
    section: 'ai_conversations',
    sectionLabel: 'AI Chats',
    displayName,
    originalName: displayName,
    lastMessage,
    lastSender: sender,
    timestamp,
    fileCount: 1,
    isAiConversation: true
  };
}

// GET /api/chats — scan all sections and return every chat thread
app.get('/api/chats', (req, res) => {
  const messagesRoot = getMessagesRoot();
  if (!messagesRoot) {
    return res.status(400).json({ error: 'No export path configured. Please set up your Instagram export folder first.' });
  }

  try {
    const config = getConfig();
    const customNames = getCustomNames();
    const chatList = [];

    // 1. Scan folder-based sections (inbox, message_requests)
    CHAT_SECTIONS.forEach(({ key: sectionKey, label: sectionLabel }) => {
      const sectionPath = path.join(messagesRoot, sectionKey);
      if (!fs.existsSync(sectionPath)) return;

      const folders = fs.readdirSync(sectionPath).filter(file => {
        const fullPath = path.join(sectionPath, file);
        return fs.statSync(fullPath).isDirectory();
      });

      folders.forEach(folder => {
        const folderPath = path.join(sectionPath, folder);
        const entry = config.format === 'json'
          ? parseFolderChatJson(sectionKey, sectionLabel, folder, folderPath, customNames)
          : parseFolderChat(sectionKey, sectionLabel, folder, folderPath, customNames);
        if (entry) chatList.push(entry);
      });
    });

    // 2. Scan AI conversations
    if (config.format === 'json') {
      const aiJsonPath = path.join(messagesRoot, 'ai_conversations.json');
      if (fs.existsSync(aiJsonPath)) {
        try {
          const aiChats = JSON.parse(fs.readFileSync(aiJsonPath, 'utf8'));
          aiChats.forEach(chat => {
            const cleanTitle = chat.title.replace(/\s+/g, '');
            const compoundId = `ai_conversations/${cleanTitle}`;
            let displayName = decodeInstagramString(chat.title).replace(/threadformailbox\d+_?/, 'AI Chat ');
            let lastMessage = 'AI conversation';
            let sender = 'Meta AI';
            let timestamp = chat.timestamp ? new Date(chat.timestamp * 1000).toString() : '';
            
            const msgsSection = chat.label_values.find(lv => lv.title === 'Messages');
            if (msgsSection && msgsSection.dict && msgsSection.dict.length > 0) {
              const lastMsgItem = msgsSection.dict[0];
              if (lastMsgItem && lastMsgItem.dict) {
                lastMsgItem.dict.forEach(field => {
                  if (field.label === 'Message' && field.value) {
                    lastMessage = decodeInstagramString(field.value);
                  }
                  if (field.label === 'Name' && field.value) {
                    sender = decodeInstagramString(field.value);
                  }
                  if (field.timestamp_value) {
                    timestamp = new Date(field.timestamp_value * 1000).toString();
                  }
                });
              }
            }
            
            if (lastMessage.length > 60) {
              lastMessage = lastMessage.substring(0, 60) + '...';
            }
            
            if (customNames[compoundId]) {
              displayName = customNames[compoundId];
            }
            
            chatList.push({
              id: compoundId,
              section: 'ai_conversations',
              sectionLabel: 'AI Chats',
              displayName,
              originalName: displayName,
              lastMessage,
              lastSender: sender,
              timestamp,
              fileCount: 1,
              isAiConversation: true
            });
          });
        } catch (e) {
          console.error('Error scanning JSON AI conversations:', e);
        }
      }
    } else {
      const aiPath = path.join(messagesRoot, 'ai_conversations');
      if (fs.existsSync(aiPath) && fs.statSync(aiPath).isDirectory()) {
        const aiFiles = fs.readdirSync(aiPath).filter(f => f.endsWith('.html'));
        aiFiles.forEach(fileName => {
          const filePath = path.join(aiPath, fileName);
          const entry = parseAiConversation(fileName, filePath, customNames);
          chatList.push(entry);
        });
      }
    }

    // Sort: most recent timestamp first
    chatList.sort((a, b) => {
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA;
    });

    res.json(chatList);
  } catch (err) {
    console.error('Error scanning chats:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chats/:section/:folder — load full message history for a chat
app.get('/api/chats/:section/:folder', (req, res) => {
  const messagesRoot = getMessagesRoot();
  if (!messagesRoot) {
    return res.status(400).json({ error: 'No export path configured.' });
  }

  const compoundId = `${req.params.section}/${req.params.folder}`;
  const section = req.params.section;
  const folder = req.params.folder;

  const config = getConfig();

  // Special handling for AI conversations
  if (section === 'ai_conversations') {
    if (config.format === 'json') {
      const aiJsonPath = path.join(messagesRoot, 'ai_conversations.json');
      if (!fs.existsSync(aiJsonPath)) {
        return res.status(404).json({ error: `AI conversations file not found` });
      }
      try {
        const aiChats = JSON.parse(fs.readFileSync(aiJsonPath, 'utf8'));
        const threadName = folder;
        const chat = aiChats.find(c => {
          const cleanTitle = c.title.replace(/\s+/g, '').toLowerCase();
          const cleanFolder = threadName.replace(/\s+/g, '').toLowerCase();
          return cleanTitle === cleanFolder || cleanTitle.includes(cleanFolder) || cleanFolder.includes(cleanTitle);
        });
        if (!chat) {
          return res.status(404).json({ error: `AI conversation not found: ${folder}` });
        }
        
        let title = decodeInstagramString(chat.title);
        const customNames = getCustomNames();
        if (customNames[compoundId]) title = customNames[compoundId];
        
        let messages = [];
        const msgsSection = chat.label_values.find(lv => lv.title === 'Messages');
        if (msgsSection && msgsSection.dict) {
          msgsSection.dict.forEach(item => {
            if (item.dict) {
              let msgText = '';
              let senderName = 'Meta AI';
              let msgTimestamp = chat.timestamp * 1000;
              let reactions = [];
              
              item.dict.forEach(field => {
                if (field.label === 'Message' && field.value) {
                  msgText = decodeInstagramString(field.value);
                }
                if (field.label === 'Name' && field.value) {
                  senderName = decodeInstagramString(field.value);
                }
                if (field.timestamp_value) {
                  msgTimestamp = field.timestamp_value * 1000;
                }
                if (field.label === 'Reactions' && field.vec) {
                  field.vec.forEach(r => {
                    reactions.push(`${decodeInstagramString(r.reaction)} ${decodeInstagramString(r.actor)}`);
                  });
                }
              });
              
              let escapedText = escapeHtml(msgText);
              escapedText = escapedText.replace(/(https?:\/\/[^\s]+)/g, '<a target="_blank" href="$1">$1</a>');
              
              messages.push({
                sender: senderName,
                content: escapedText,
                timestamp: new Date(msgTimestamp).toString(),
                reactions,
                timeValue: msgTimestamp
              });
            }
          });
        }
        
        messages.sort((a, b) => a.timeValue - b.timeValue);
        
        return res.json({
          id: compoundId,
          displayName: title,
          messages
        });
      } catch (err) {
        console.error(`Error loading AI conversation JSON ${compoundId}:`, err);
        return res.status(500).json({ error: err.message });
      }
    } else {
      const filePath = path.join(messagesRoot, 'ai_conversations', folder);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: `AI conversation not found: ${folder}` });
      }

      try {
        const html = fs.readFileSync(filePath, 'utf8');
        const $ = cheerio.load(html);
        let title = $('title').text().trim() || folder.replace('.html', '');
        let messages = [];

        const customNames = getCustomNames();
        if (customNames[compoundId]) title = customNames[compoundId];

        $('div.pam._3-95._2ph-._a6-g.uiBoxWhite.noborder').each((i, elem) => {
          const sender = $(elem).find('h2').text().trim();
          const textContainer = $(elem).find('div._3-95._a6-p');
          if (!textContainer.length) return;

          const reactions = [];
          $(elem).find('ul._a6-q li span').each((rIdx, rElem) => {
            reactions.push($(rElem).text().trim());
          });

          let timestamp = $(elem).next('div._3-94._a6-o').text().trim();
          if (!timestamp) timestamp = $(elem).find('div._3-94._a6-o').text().trim();

          let bodyHtml = textContainer.html() || '';

          messages.push({
            sender,
            content: bodyHtml,
            timestamp,
            reactions,
            timeValue: timestamp ? new Date(timestamp).getTime() : 0
          });
        });

        messages.sort((a, b) => a.timeValue - b.timeValue);

        return res.json({
          id: compoundId,
          displayName: title,
          messages
        });
      } catch (err) {
        console.error(`Error loading AI conversation ${compoundId}:`, err);
        return res.status(500).json({ error: err.message });
      }
    }
  }

  // Standard folder-based chat loading
  const resolved = resolveChatPath(compoundId);
  if (!resolved || !fs.existsSync(resolved.folderPath)) {
    return res.status(404).json({ error: `Chat folder not found: ${compoundId}` });
  }

  if (config.format === 'json') {
    try {
      const files = fs.readdirSync(resolved.folderPath).filter(f => f.startsWith('message_') && f.endsWith('.json'));
      let messages = [];
      let title = resolved.folder;
      const customNames = getCustomNames();

      files.forEach(file => {
        const filePath = path.join(resolved.folderPath, file);
        const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        if (file === 'message_1.json' && json.title) {
          title = decodeInstagramString(json.title);
        }

        if (json.messages) {
          json.messages.forEach(msg => {
            let sender = decodeInstagramString(msg.sender_name || '');
            let text = escapeHtml(decodeInstagramString(msg.content || ''));

            text = text.replace(/(https?:\/\/[^\s]+)/g, '<a target="_blank" href="$1">$1</a>');

            if (msg.photos) {
              msg.photos.forEach(photo => {
                text += `<img src="/${photo.uri}" class="chat-image" />`;
              });
            }
            if (msg.videos) {
              msg.videos.forEach(video => {
                text += `<video src="/${video.uri}" controls class="chat-video"></video>`;
              });
            }
            if (msg.audio_files) {
              msg.audio_files.forEach(audio => {
                text += `<audio src="/${audio.uri}" controls class="chat-audio"></audio>`;
              });
            }
            if (msg.share && msg.share.link) {
              text += `<div class="attachment-card">`;
              if (msg.share.share_text) {
                text += `<div class="share-text">${escapeHtml(decodeInstagramString(msg.share.share_text))}</div>`;
              }
              text += `<a target="_blank" href="${msg.share.link}">${msg.share.link}</a></div>`;
            }

            const reactions = [];
            if (msg.reactions) {
              msg.reactions.forEach(r => {
                reactions.push(`${decodeInstagramString(r.reaction)} ${decodeInstagramString(r.actor)}`);
              });
            }

            messages.push({
              sender,
              content: text,
              timestamp: new Date(msg.timestamp_ms).toString(),
              reactions,
              timeValue: msg.timestamp_ms
            });
          });
        }
      });

      messages.sort((a, b) => a.timeValue - b.timeValue);

      if (customNames[compoundId]) {
        title = customNames[compoundId];
      }

      res.json({
        id: compoundId,
        displayName: title,
        messages
      });
    } catch (err) {
      console.error(`Error loading JSON chat ${compoundId}:`, err);
      res.status(500).json({ error: err.message });
    }
  } else {
    try {
      const files = fs.readdirSync(resolved.folderPath).filter(f => f.startsWith('message_') && f.endsWith('.html'));
      let messages = [];
      let title = resolved.folder;
      const customNames = getCustomNames();

      files.forEach(file => {
        const filePath = path.join(resolved.folderPath, file);
        const html = fs.readFileSync(filePath, 'utf8');
        const $ = cheerio.load(html);

        if (file === 'message_1.html') {
          const titleText = $('title').text().trim();
          if (titleText) title = titleText;
        }

        $('div.pam._3-95._2ph-._a6-g.uiBoxWhite.noborder').each((i, elem) => {
          const sender = $(elem).find('h2').text().trim();
          const textContainer = $(elem).find('div._3-95._a6-p');

          if (!textContainer.length) return;

          const reactions = [];
          $(elem).find('ul._a6-q li span').each((rIdx, rElem) => {
            reactions.push($(rElem).text().trim());
          });

          let timestamp = $(elem).next('div._3-94._a6-o').text().trim();
          if (!timestamp) timestamp = $(elem).find('div._3-94._a6-o').text().trim();

          let bodyHtml = textContainer.html() || '';

          messages.push({
            sender,
            content: bodyHtml,
            timestamp,
            reactions,
            timeValue: timestamp ? new Date(timestamp).getTime() : 0
          });
        });
      });

      messages.sort((a, b) => a.timeValue - b.timeValue);

      if (customNames[compoundId]) {
        title = customNames[compoundId];
      }

      res.json({
        id: compoundId,
        displayName: title,
        messages
      });
    } catch (err) {
      console.error(`Error loading chat ${compoundId}:`, err);
      res.status(500).json({ error: err.message });
    }
  }
});

// POST /api/chats/:section/:folder/rename — rename the chat folder on disk
app.post('/api/chats/:section/:folder/rename', (req, res) => {
  const compoundId = `${req.params.section}/${req.params.folder}`;
  const { newName } = req.body;

  if (!newName || !newName.trim()) {
    return res.status(400).json({ error: 'newName is required' });
  }

  const cleanName = cleanFolderName(newName);
  if (!cleanName) return res.status(400).json({ error: 'Invalid name characters' });

  const resolved = resolveChatPath(compoundId);
  if (!resolved || !fs.existsSync(resolved.folderPath)) {
    return res.status(404).json({ error: `Chat folder not found: ${compoundId}` });
  }

  let targetFolder = cleanName;
  let targetPath = path.join(resolved.sectionPath, targetFolder);

  if (fs.existsSync(targetPath) && targetFolder.toLowerCase() !== resolved.folder.toLowerCase()) {
    targetFolder = `${cleanName}_${Date.now()}`;
    targetPath = path.join(resolved.sectionPath, targetFolder);
  }

  try {
    fs.renameSync(resolved.folderPath, targetPath);

    const newCompoundId = `${resolved.section}/${targetFolder}`;
    const customNames = getCustomNames();
    delete customNames[compoundId];
    customNames[newCompoundId] = newName.trim();
    saveCustomNames(customNames);

    res.json({
      success: true,
      oldId: compoundId,
      newId: newCompoundId,
      displayName: newName.trim()
    });
  } catch (err) {
    console.error(`Error renaming ${compoundId}:`, err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/chats/:section/:folder — delete the chat folder/file from disk
app.delete('/api/chats/:section/:folder', (req, res) => {
  const messagesRoot = getMessagesRoot();
  if (!messagesRoot) {
    return res.status(400).json({ error: 'No export path configured.' });
  }

  const compoundId = `${req.params.section}/${req.params.folder}`;
  const section = req.params.section;
  const folder = req.params.folder;
  const config = getConfig();

  // Special handling for AI conversations (single file delete)
  if (section === 'ai_conversations') {
    if (config.format === 'json') {
      const aiJsonPath = path.join(messagesRoot, 'ai_conversations.json');
      if (!fs.existsSync(aiJsonPath)) {
        return res.status(404).json({ error: `AI conversations file not found` });
      }
      try {
        let aiChats = JSON.parse(fs.readFileSync(aiJsonPath, 'utf8'));
        const originalLength = aiChats.length;
        
        const threadName = folder;
        aiChats = aiChats.filter(c => {
          const cleanTitle = c.title.replace(/\s+/g, '').toLowerCase();
          const cleanFolder = threadName.replace(/\s+/g, '').toLowerCase();
          return !(cleanTitle === cleanFolder || cleanTitle.includes(cleanFolder) || cleanFolder.includes(cleanTitle));
        });
        
        if (aiChats.length === originalLength) {
          return res.status(404).json({ error: `AI conversation not found to delete: ${folder}` });
        }
        
        fs.writeFileSync(aiJsonPath, JSON.stringify(aiChats, null, 2), 'utf8');
        
        const customNames = getCustomNames();
        if (customNames[compoundId]) {
          delete customNames[compoundId];
          saveCustomNames(customNames);
        }
        return res.json({ success: true, message: `AI conversation ${folder} was successfully deleted.` });
      } catch (err) {
        console.error(`Error deleting AI conversation JSON:`, err);
        return res.status(500).json({ error: err.message });
      }
    } else {
      const filePath = path.join(messagesRoot, 'ai_conversations', folder);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: `AI conversation not found: ${folder}` });
      }

      try {
        fs.unlinkSync(filePath);
        const customNames = getCustomNames();
        if (customNames[compoundId]) {
          delete customNames[compoundId];
          saveCustomNames(customNames);
        }
        return res.json({ success: true, message: `AI conversation ${folder} was successfully deleted.` });
      } catch (err) {
        console.error(`Error deleting AI conversation ${compoundId}:`, err);
        return res.status(500).json({ error: err.message });
      }
    }
  }

  // Standard folder-based delete
  const resolved = resolveChatPath(compoundId);
  if (!resolved || !fs.existsSync(resolved.folderPath)) {
    return res.status(404).json({ error: `Chat folder not found: ${compoundId}` });
  }

  try {
    fs.rmSync(resolved.folderPath, { recursive: true, force: true });

    const customNames = getCustomNames();
    if (customNames[compoundId]) {
      delete customNames[compoundId];
      saveCustomNames(customNames);
    }

    res.json({ success: true, message: `Chat ${compoundId} was successfully deleted.` });
  } catch (err) {
    console.error(`Error deleting ${compoundId}:`, err);
    res.status(500).json({ error: err.message });
  }
});

// ──────── Start Server ────────
app.listen(PORT, () => {
  const config = getConfig();
  console.log(`===================================================`);
  console.log(`🚀 Instagram Export Message Reader Server is running!`);
  console.log(`👉 Access URL: http://localhost:${PORT}`);
  if (config.exportPath) {
    const messagesRoot = getMessagesRoot();
    console.log(`👉 Export path: ${config.exportPath}`);
    console.log(`👉 Scanning sections under: ${messagesRoot}`);
    CHAT_SECTIONS.forEach(s => {
      const p = path.join(messagesRoot, s.key);
      const count = fs.existsSync(p) ? fs.readdirSync(p).filter(f => fs.statSync(path.join(p, f)).isDirectory()).length : 0;
      console.log(`   📁 ${s.label} (${s.key}): ${count} chats`);
    });
    const aiP = path.join(messagesRoot, 'ai_conversations');
    const aiCount = fs.existsSync(aiP) ? fs.readdirSync(aiP).filter(f => f.endsWith('.html')).length : 0;
    console.log(`   🤖 AI Chats (ai_conversations): ${aiCount} chats`);
  } else {
    console.log(`⚙️  No export path configured yet. Open the browser to set it up.`);
  }
  console.log(`===================================================`);
});
