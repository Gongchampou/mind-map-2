/**
 * Brainwave - Visual Mind Mapper
 * A vanilla JS application for creating, organizing, and visualizing ideas.
 */

import { supabase } from './supabaseClient.js';

// ----- DOM Element References -----
const stage = document.getElementById('stage');
const viewport = document.getElementById('viewport');
const wiresSVG = document.getElementById('wires');
const selTxt = document.getElementById('selTxt');
const searchInput = document.getElementById('search');
const mobileSearchInput = document.getElementById('mobileSearch');
const modal = document.getElementById('modal');
const modalForm = document.getElementById('modalForm');
const modalTitle = document.getElementById('modalTitle');
const nodeIdInput = document.getElementById('nodeIdInput');
const nodeTitleInput = document.getElementById('nodeTitleInput');
const nodeUrlInput = document.getElementById('nodeUrlInput');
const nodeDescTextarea = document.getElementById('nodeDescTextarea');
const colorPaletteContainer = document.getElementById('colorPalette');
const helpWidget = document.getElementById('helpWidget');
const helpToggleBtn = document.getElementById('helpToggleBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const lockNodeBtn = document.getElementById('lockNodeBtn');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const authStatus = document.getElementById('authStatus');
const addChildBtn = document.getElementById('addChild');
const editNodeBtn = document.getElementById('editNode');
const deleteNodeBtn = document.getElementById('deleteNode');
const layoutBtn = document.getElementById('layoutBtn');
const centerBtn = document.getElementById('centerBtn');
const resetBtn = document.getElementById('resetBtn');
const exportBtn = document.getElementById('exportBtn');
const importFileInput = document.getElementById('file');
const importLabel = importFileInput?.parentElement;
const authModal = document.getElementById('authModal');
const authForm = document.getElementById('authForm');
const authModalTitle = document.getElementById('authModalTitle');
const authDescription = document.getElementById('authDescription');
const authEmailInput = document.getElementById('authEmailInput');
const authPasswordInput = document.getElementById('authPasswordInput');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authToggleMode = document.getElementById('authToggleMode');
const authErrorMsg = document.getElementById('authErrorMsg');
const authCloseBtn = document.getElementById('authCloseBtn');
const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const toolbar = document.getElementById('toolbar');

// ----- Constants -----
const SAVE_KEY = 'brainwave-mindmap-v2'; // Incremented version for new features
const THEME_KEY = 'brainwave-theme';
const COLORS = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899'];
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const DEFAULT_NODE_HEIGHT = 140;
const NODE_VERTICAL_GAP = 60;
const SUPABASE_TABLE = 'mindmaps';
const REMOTE_SAVE_DEBOUNCE = 400;

// ----- Application State -----
const state = {
  nodes: [],
  selectedId: null,
  scale: 1,
  pan: { x: 0, y: 0 },
  nextId: 1,
  editingNodeId: null,
  session: null,
  currentUserId: null,
  pendingSavePayload: null,
  remoteSaveTimer: null,
  authMode: 'signin',
  isAuthProcessing: false,
  searchTerm: '',
  dragState: {
    isPanning: false,
    isDraggingNode: false,
    nodeId: null,
    startX: 0,
    startY: 0,
    startPan: { x: 0, y: 0 },
    nodeStartPos: { x: 0, y: 0 },
  }
};

// ----- State Management & Utils -----
function serializeState() {
  return {
    nodes: state.nodes.map(({ width, height, ...rest }) => rest),
    nextId: state.nextId,
    pan: state.pan,
    scale: state.scale,
    selectedId: state.selectedId,
  };
}

function applyPersistedState(obj) {
  state.nodes = obj.nodes || [];
  state.nodes.forEach(n => {
    if (n.collapsed === undefined) n.collapsed = false;
    if (n.locked === undefined) n.locked = false;
  });
  state.nextId = obj.nextId || 1;
  state.pan = obj.pan || { x: 0, y: 0 };
  state.scale = obj.scale || 1;
  state.selectedId = obj.selectedId || null;
}

function getLocalSaveKey(userId = state.currentUserId) {
  if (userId) {
    return `${SAVE_KEY}:user:${userId}`;
  }
  return `${SAVE_KEY}:guest`;
}

function saveLocal(payload) {
  try {
    localStorage.setItem(getLocalSaveKey(), JSON.stringify(payload));
  } catch (e) {
    console.warn('Failed to save to localStorage', e);
  }
}

function loadLocal() {
  const txt = localStorage.getItem(getLocalSaveKey());
  if (!txt) return false;
  try {
    const obj = JSON.parse(txt);
    applyPersistedState(obj);
    return true;
  } catch (e) {
    console.warn('Failed to load from localStorage', e);
    return false;
  }
}

async function saveRemote(payload) {
  if (!state.currentUserId) return;
  const { error } = await supabase
    .from(SUPABASE_TABLE)
    .upsert({
      user_id: state.currentUserId,
      data: payload,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error('Failed to save to Supabase', error);
  }
}

function scheduleRemoteSave(payload) {
  if (!state.currentUserId) return;
  state.pendingSavePayload = payload;
  if (state.remoteSaveTimer) {
    clearTimeout(state.remoteSaveTimer);
  }
  state.remoteSaveTimer = setTimeout(() => {
    const data = state.pendingSavePayload;
    state.remoteSaveTimer = null;
    if (data) saveRemote(data);
  }, REMOTE_SAVE_DEBOUNCE);
}

async function loadRemote() {
  if (!state.currentUserId) return false;
  const { data, error } = await supabase
    .from(SUPABASE_TABLE)
    .select('data')
    .eq('user_id', state.currentUserId)
    .maybeSingle();

  if (error) {
    console.error('Failed to load from Supabase', error);
    return false;
  }

  if (!data || !data.data) return false;

  applyPersistedState(data.data);
  saveLocal(data.data);
  return true;
}

function save() {
  const payload = serializeState();
  saveLocal(payload);
  scheduleRemoteSave(payload);
}

async function initAuth() {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error) {
      console.error('Failed to get Supabase session', error);
    }
    await handleSessionChange(session);
  } catch (err) {
    console.error('Supabase session error', err);
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    handleSessionChange(session);
  });
}

async function handleSessionChange(session) {
  const previousUserId = state.currentUserId;
  state.session = session;
  state.currentUserId = session?.user?.id ?? null;

  if (state.remoteSaveTimer) {
    clearTimeout(state.remoteSaveTimer);
    state.remoteSaveTimer = null;
  }
  state.pendingSavePayload = null;

  // Clear previous user's data to ensure isolation
  if (previousUserId !== state.currentUserId) {
    if (previousUserId) {
      localStorage.removeItem(getLocalSaveKey(previousUserId));
    } else {
      // Clear guest data when signing in
      localStorage.removeItem(getLocalSaveKey(null));
    }
  }

  updateAuthUI();

  if (state.currentUserId) {
    // Signed in: load user's data from Supabase
    const loadedLocal = loadLocal();
    if (state.nodes.length === 0) {
      createRootIfNeeded();
    }
    try {
      const loadedRemote = await loadRemote();
      if (!loadedRemote && state.nodes.length === 0) {
        createRootIfNeeded();
      }
    } catch (err) {
      console.error('Error loading Supabase data', err);
    }
  } else {
    // Guest mode: clear all signed-in data and start fresh
    state.nodes = [];
    state.nextId = 1;
    state.pan = { x: 0, y: 0 };
    state.scale = 1;
    state.selectedId = null;
    // Load guest-only data
    const guestData = loadLocal();
    if (!guestData || state.nodes.length === 0) {
      createRootIfNeeded();
    }
    centerView();
  }

  setTransform();
  render();
}

function updateAuthUI() {
  if (!loginBtn || !logoutBtn || !authStatus) return;
  
  const isSignedIn = !!state.currentUserId;
  
  // Auth status and buttons
  if (isSignedIn) {
    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-flex';
    authStatus.textContent = state.session?.user?.email || 'Signed in';
    authStatus.classList.add('badge-success');
  } else {
    loginBtn.style.display = 'inline-flex';
    logoutBtn.style.display = 'none';
    authStatus.textContent = 'Guest mode';
    authStatus.classList.remove('badge-success');
  }
  
  // Node manipulation buttons (hidden in guest mode)
  if (addChildBtn) addChildBtn.style.display = isSignedIn ? 'inline-flex' : 'none';
  if (editNodeBtn) editNodeBtn.style.display = isSignedIn ? 'inline-flex' : 'none';
  if (lockNodeBtn) lockNodeBtn.style.display = isSignedIn ? 'inline-flex' : 'none';
  if (deleteNodeBtn) deleteNodeBtn.style.display = isSignedIn ? 'inline-flex' : 'none';
  
  // Layout buttons (hidden in guest mode, except center/reset which are navigation only)
  if (layoutBtn) layoutBtn.style.display = isSignedIn ? 'inline-flex' : 'none';
  if (centerBtn) centerBtn.style.display = 'inline-flex'; // Always visible
  if (resetBtn) resetBtn.style.display = 'inline-flex'; // Always visible
  
  // File operations (hidden in guest mode)
  if (exportBtn) exportBtn.style.display = isSignedIn ? 'inline-flex' : 'none';
  if (importLabel) importLabel.style.display = isSignedIn ? 'inline-flex' : 'none';
  
  // Search and theme toggle (always visible)
  // These are already visible by default, no change needed
  
  // Clear selection in guest mode since editing is disabled
  if (!isSignedIn && state.selectedId) {
    selectNode(null);
  }
}

function setAuthProcessing(isProcessing) {
  state.isAuthProcessing = isProcessing;
  if (authSubmitBtn) authSubmitBtn.disabled = isProcessing;
  if (authEmailInput) authEmailInput.disabled = isProcessing;
  if (authPasswordInput) authPasswordInput.disabled = isProcessing;
}

function updateAuthModal() {
  if (!authModal || !authModalTitle || !authSubmitBtn || !authToggleMode) return;
  const isSignUp = state.authMode === 'signup';
  authModalTitle.textContent = isSignUp ? 'Create Account' : 'Sign In';
  authSubmitBtn.textContent = isSignUp ? 'Create Account' : 'Sign In';
  authToggleMode.textContent = isSignUp ? 'Already have an account? Sign in' : 'Need an account? Create one';
  if (authDescription) {
    authDescription.textContent = isSignUp
      ? 'Set up a Supabase account to sync your mind maps across devices.'
      : 'Sign in to access your saved mind maps from Supabase.';
  }
  if (authPasswordInput) {
    authPasswordInput.placeholder = isSignUp ? 'Create a password (min 6 chars)' : 'Enter your password';
    authPasswordInput.autocomplete = isSignUp ? 'new-password' : 'current-password';
  }
  if (authErrorMsg) authErrorMsg.textContent = '';
  if (authSubmitBtn) authSubmitBtn.disabled = false;
}

function openAuthModal(mode = 'signin') {
  if (!authModal) return;
  // Close mobile menu if open when opening auth modal
  if (window.innerWidth <= 767) {
    closeMobileMenu();
  }
  state.authMode = mode;
  updateAuthModal();
  if (authForm) authForm.reset();
  if (authErrorMsg) authErrorMsg.textContent = '';
  authModal.style.display = 'flex';
  requestAnimationFrame(() => authEmailInput?.focus());
}

function closeAuthModal() {
  if (!authModal) return;
  authModal.style.display = 'none';
  setAuthProcessing(false);
  if (authForm) authForm.reset();
  if (authErrorMsg) authErrorMsg.textContent = '';
  state.authMode = 'signin';
  updateAuthModal();
}

async function handleAuthSubmit(e) {
  e?.preventDefault?.();
  if (!authEmailInput || !authPasswordInput) return;

  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value.trim();
  if (!email || !password) {
    if (authErrorMsg) authErrorMsg.textContent = 'Email and password are required.';
    return;
  }

  setAuthProcessing(true);
  if (authErrorMsg) authErrorMsg.textContent = '';

  try {
    if (state.authMode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (authErrorMsg) authErrorMsg.textContent = error.message || 'Unable to sign in.';
      } else {
        closeAuthModal();
      }
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        if (authErrorMsg) authErrorMsg.textContent = error.message || 'Unable to create account.';
      } else {
        state.authMode = 'signin';
        updateAuthModal();
        if (authErrorMsg) authErrorMsg.textContent = 'Check your email to confirm the account, then sign in.';
      }
    }
  } catch (err) {
    if (authErrorMsg) authErrorMsg.textContent = err?.message || 'Unexpected error.';
  } finally {
    setAuthProcessing(false);
  }
}

function signIn() {
  openAuthModal('signin');
}

async function signOut() {
  closeAuthModal();
  const { error } = await supabase.auth.signOut();
  if (error) {
    alert(`Sign out failed: ${error.message}`);
  }
}

function createRootIfNeeded() {
  if (state.nodes.length === 0) {
    state.nodes.push({
      id: 'root',
      title: 'Master The Brain',
      description: 'This is the central idea of your mind map.',
      url: '',
      color: 9,
      x: 0,
      y: 0,
      parentId: null,
      collapsed: false,
      locked: false,
    });
  }
}

const byId = (id) => state.nodes.find(n => n.id === id);
const childrenOf = (id) => state.nodes.filter(n => n.parentId === id);
const inferNextId = (nodes, providedNextId) => {
    const numericIds = nodes
        .map(n => {
            const numeric = Number(n?.id);
            return Number.isFinite(numeric) ? numeric : null;
        })
        .filter((n) => n !== null);

    const maxNumericId = numericIds.length ? Math.max(...numericIds) : 0;
    const coercedNextId = Number(providedNextId);

    if (Number.isFinite(coercedNextId) && coercedNextId > maxNumericId) {
        return Math.floor(coercedNextId);
    }

    return maxNumericId + 1;
};
const escapeHtml = (s) => (s + "").replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const escapeAttr = (s) => (s + "").replace(/["<>]/g, c => ({ '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]));

// ----- Rendering Engine -----
function setTransform() {
  viewport.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.scale})`;
  viewport.style.transformOrigin = '0 0';
}

function getVisibleNodes() {
    const visible = new Set();
    const queue = state.nodes.filter(n => !n.parentId); // Start with roots
    
    while (queue.length > 0) {
        const node = queue.shift();
        visible.add(node);
        if (!node.collapsed) {
            childrenOf(node.id).forEach(child => queue.push(child));
        }
    }
    return Array.from(visible);
}

function render() {
    const visibleNodes = getVisibleNodes();
    const nodeElements = new Map(
        Array.from(viewport.querySelectorAll('.node')).map(el => [el.dataset.id, el])
    );
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));

    // Remove nodes that are no longer visible
    nodeElements.forEach((el, id) => {
        if (!visibleNodeIds.has(id)) {
            el.remove();
            nodeElements.delete(id);
        }
    });

    // Add or update visible nodes
    visibleNodes.forEach(n => {
        let el = nodeElements.get(n.id);
        if (!el) {
            el = document.createElement('div');
            el.dataset.id = n.id;
            el.tabIndex = 0;
            viewport.appendChild(el);
            nodeElements.set(n.id, el);
        }

        const isGuestMode = !state.currentUserId;
        el.className = `node color-${n.color || 9}` 
            + (state.selectedId === n.id ? ' selected' : '')
            + (n.locked ? ' locked' : '')
            + (isGuestMode ? ' guest-readonly' : '');

        el.style.left = `${n.x}px`;
        el.style.top = `${n.y}px`;
        
        // Disable cursor grab in guest mode
        if (isGuestMode) {
            el.style.cursor = 'default';
        } else {
            el.style.cursor = '';
        }

        const hasChildren = childrenOf(n.id).length > 0;
        const isCollapsed = n.collapsed;

        el.innerHTML = `
          ${n.locked ? `<svg class="node-lock-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>` : ''}
          <div class="title">${escapeHtml(n.title || '(untitled)')}</div>
          ${n.description ? `<div class="description">${escapeHtml(n.description)}</div>` : ''}
          ${n.url ? `<a class="url" href="${escapeAttr(n.url)}" target="_blank" rel="noopener">${escapeHtml(n.url)}</a>` : ''}
          <div class="meta">
            <span class="chip">${childrenOf(n.id).length} children</span>
            <span class="chip">ID: ${n.id}</span>
          </div>
          ${hasChildren && state.currentUserId ? `<div class="node-collapse-toggle" title="${isCollapsed ? 'Expand' : 'Collapse'}">${isCollapsed ? '+' : '−'}</div>` : ''}
        `;
    });

    // Measure nodes for accurate wire placement
    state.nodes.forEach(n => {
        const el = nodeElements.get(n.id);
        if (el) {
            n.width = el.offsetWidth;
            n.height = el.offsetHeight;
        }
    });

    renderWires(visibleNodes);
    updateSelText();
    updateButtonStates();
    highlightSearchResults(state.searchTerm || '', { focusOnFirst: false });
}

function renderWires(visibleNodes) {
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    if (visibleNodes.length > 0) {
        visibleNodes.forEach(n => {
            const halfW = (n.width || 240) / 2;
            const halfH = (n.height || 80) / 2;
            minX = Math.min(minX, n.x - halfW); minY = Math.min(minY, n.y - halfH);
            maxX = Math.max(maxX, n.x + halfW); maxY = Math.max(maxY, n.y + halfH);
        });
    } else {
        minX = -500; minY = -500; maxX = 500; maxY = 500;
    }

    const padding = 200;
    minX -= padding; minY -= padding; maxX += padding; maxY += padding;

    wiresSVG.style.left = `${minX}px`; wiresSVG.style.top = `${minY}px`;
    wiresSVG.style.width = `${maxX - minX}px`; wiresSVG.style.height = `${maxY - minY}px`;
    
    const defs = wiresSVG.querySelector('defs');
    wiresSVG.innerHTML = defs ? defs.outerHTML : '';

    visibleNodes.forEach(n => {
        if (n.parentId && visibleNodeIds.has(n.parentId)) {
            const p = byId(n.parentId);
            if (!p) return;

            const startX = p.x + (p.width / 2);
            const startY = p.y;
            const endX = n.x - (n.width / 2);
            const endY = n.y;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const shadow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            
            path.dataset.childId = n.id;
            shadow.dataset.childId = n.id;
            
            const c = orthogonalConnector(startX - minX, startY - minY, endX - minX, endY - minY);
            
            shadow.setAttribute('d', c); shadow.setAttribute('class', 'wire shadow');
            path.setAttribute('d', c); path.setAttribute('class', 'wire');
            wiresSVG.appendChild(shadow);
            wiresSVG.appendChild(path);
        }
    });
}

function orthogonalConnector(x1, y1, x2, y2) {
    const midX = x1 + (x2 - x1) / 2;
    return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
}

// ----- UI & Interaction -----
function selectNode(id) {
  if (state.selectedId === id) return;
  if (state.selectedId) {
    const oldNodeEl = viewport.querySelector(`.node[data-id="${state.selectedId}"]`);
    if (oldNodeEl) oldNodeEl.classList.remove('selected');
  }
  state.selectedId = id;
  if (id) {
    const newNodeEl = viewport.querySelector(`.node[data-id="${id}"]`);
    if (newNodeEl) newNodeEl.classList.add('selected');
  }
  updateSelText();
  updateButtonStates();
  save();
}

function updateSelText() {
  const n = byId(state.selectedId);
  selTxt.textContent = n ? `Selected: ${n.title || n.id}` : 'No node selected';
}

function updateButtonStates() {
    const selectedNode = byId(state.selectedId);
    const isNodeSelected = !!selectedNode;
    const isRootSelected = state.selectedId === 'root';
    const isLocked = isNodeSelected && selectedNode.locked;

    document.getElementById('editNode').disabled = !isNodeSelected || isLocked;
    document.getElementById('deleteNode').disabled = !isNodeSelected || isRootSelected || isLocked;
    lockNodeBtn.disabled = !isNodeSelected;

    if (isNodeSelected) {
        lockNodeBtn.classList.toggle('is-locked', isLocked);
        lockNodeBtn.title = isLocked ? 'Unlock node (L)' : 'Lock node (L)';
    }
}

function toggleNodeCollapse(nodeId) {
    const node = byId(nodeId);
    if (node) {
        node.collapsed = !node.collapsed;
        save();
        render();
    }
}

function toggleLockSelected() {
    if (!state.currentUserId) return;
    const node = byId(state.selectedId);
    if (node) {
        node.locked = !node.locked;
        save();
        render(); // Re-render to update class, icon, and button states
    }
}

// ----- Modal & Form Logic -----
function openModal({ isNew = false, parentId = null } = {}) {
  if (!state.currentUserId) return;
  // Close mobile menu if open when opening modal
  if (window.innerWidth <= 767) {
    closeMobileMenu();
  }
  state.editingNodeId = isNew ? null : state.selectedId;
  modalTitle.textContent = isNew ? 'Add Child Node' : 'Edit Node';

  let nodeData = { title: '', url: '', description: '', color: Math.floor(Math.random() * 12) + 1 };
  if (!isNew && state.editingNodeId) {
    const n = byId(state.editingNodeId);
    if (n) nodeData = { ...n };
  }
  
  nodeIdInput.value = isNew ? `new-${Date.now()}` : state.editingNodeId;
  if (isNew) nodeIdInput.dataset.parentId = parentId;
  nodeTitleInput.value = nodeData.title;
  nodeUrlInput.value = nodeData.url;
  nodeDescTextarea.value = nodeData.description;

  colorPaletteContainer.innerHTML = COLORS.map((color, i) => `
    <div class="color-swatch ${nodeData.color === i + 1 ? 'selected' : ''}" 
         style="background-color: ${color};" 
         data-color-index="${i + 1}">
    </div>
  `).join('');
  
  modal.style.display = 'flex';
  nodeTitleInput.focus();
}

function closeModal() {
  modal.style.display = 'none';
  state.editingNodeId = null;
}

modalForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = nodeTitleInput.value.trim();
  if (!title) return;

  const url = nodeUrlInput.value.trim();
  const description = nodeDescTextarea.value.trim();
  const selectedSwatch = colorPaletteContainer.querySelector('.selected');
  const color = selectedSwatch ? parseInt(selectedSwatch.dataset.colorIndex) : 1;

  if (state.editingNodeId) {
    const node = byId(state.editingNodeId);
    if (node) {
      Object.assign(node, { title, url, description, color });
    }
  } else {
    const parentId = nodeIdInput.dataset.parentId;
    let p = byId(parentId);

    if (!p) {
        p = byId('root');
        if (!p) {
            createRootIfNeeded();
            p = byId('root');
        }
    }
    
    const id = String(state.nextId++);
    const siblings = childrenOf(p.id);
    let targetY;

    if (siblings.length === 0) {
        targetY = p.y || 0;
    } else {
        const lastBottom = siblings.reduce((max, child) => {
            const height = child.height ?? DEFAULT_NODE_HEIGHT;
            return Math.max(max, child.y + height / 2);
        }, -Infinity);

        targetY = lastBottom + NODE_VERTICAL_GAP + DEFAULT_NODE_HEIGHT / 2;
    }

    state.nodes.push({ id, title, url, description, color, x: (p.x || 0) + 350, y: targetY, parentId: p.id, collapsed: false, locked: false });
    selectNode(id);
  }

  closeModal();
  save();
  render();
});

// ----- Commands & Layout -----
const addChild = () => {
  if (!state.currentUserId) return;
  openModal({ isNew: true, parentId: state.selectedId || 'root' });
};
const editSelected = () => {
  if (!state.currentUserId || !state.selectedId) return;
  openModal();
};

function deleteSelected() {
  if (!state.currentUserId) return;
  const id = state.selectedId;
  const node = byId(id);
  if (!node || node.id === 'root' || node.locked) {
      alert('Cannot delete the root node or a locked node.');
      return;
  }
  if (!confirm('Delete selected node and all its descendants?')) return;

  const toDelete = new Set();
  (function walk(x) { toDelete.add(x); childrenOf(x).forEach(c => walk(c.id)); })(id);
  state.nodes = state.nodes.filter(n => !toDelete.has(n.id));
  selectNode(null);
  save();
  render();
}

function treeLayout() {
    if (!state.currentUserId) return;
    const root = byId('root');
    if (!root) return;
    
    const xGap = 350;
    const yGap = 30;

    function getSubtreeHeight(nodeId) {
        const node = byId(nodeId);
        const children = childrenOf(nodeId);
        if (node.collapsed || children.length === 0) {
            return (node.height || 100) + yGap;
        }
        return children.reduce((h, child) => h + getSubtreeHeight(child.id), 0);
    }

    function place(node, x, y) {
        if (node.locked) return; // Do not move locked nodes
        node.x = x;
        node.y = y;
        
        if (node.collapsed) return;

        const children = childrenOf(node.id);
        const totalHeight = getSubtreeHeight(node.id) - ((node.height || 100) + yGap);
        let yCursor = y - totalHeight / 2;

        children.forEach(child => {
            const childHeight = getSubtreeHeight(child.id);
            place(child, x + xGap, yCursor + childHeight / 2);
            yCursor += childHeight;
        });
    }

    place(root, root.x, root.y);
    save();
    render();
    centerView();
}

function centerView() {
  const rect = document.body.getBoundingClientRect();
  const root = byId('root'); if (!root) return;
  state.pan.x = rect.width / 2 - root.x * state.scale;
  state.pan.y = rect.height / 2 - root.y * state.scale;
  setTransform();
  save();
}

function focusOnNode(node) {
  if (!node) return;
  const rect = stage?.getBoundingClientRect() || document.body.getBoundingClientRect();
  state.pan.x = rect.width / 2 - node.x * state.scale;
  state.pan.y = rect.height / 2 - node.y * state.scale;
  setTransform();
}

function resetZoom() { state.scale = 1; state.pan = { x: 0, y: 0 }; setTransform(); save(); render(); centerView(); }

// ----- Export / Import -----
function exportJSON() {
  if (!state.currentUserId) return;
  const nodesToExport = state.nodes.map(({ width, height, ...rest }) => rest);
  const payload = {
    nodes: nodesToExport,
    nextId: state.nextId,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'brainwave-mindmap.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

// ----- Event Listeners (Pan, Zoom, Drag) -----
function handlePointerDown(e) {
    const target = e.target;
    if (modal.style.display !== 'none') return;

    if (target.classList.contains('node-collapse-toggle')) {
        if (!state.currentUserId) return;
        toggleNodeCollapse(target.closest('.node').dataset.id);
        return;
    }

  const nodeElement = target.closest('.node');
  if (nodeElement) {
    const node = byId(nodeElement.dataset.id);
    // In guest mode, only allow viewing (no selection or dragging)
    if (!state.currentUserId) return;
    selectNode(node.id); // Allow selection regardless of lock state
    if (node.locked || e.button !== 0) return; // Prevent drag if locked

    nodeElement.style.cursor = 'grabbing';
    state.dragState = {
      isDraggingNode: true,
      isPanning: false,
      nodeId: node.id,
      startX: e.clientX,
      startY: e.clientY,
      nodeStartPos: { x: node.x, y: node.y },
    };
    nodeElement.setPointerCapture(e.pointerId);
  } else if (target.closest('#stage')) {
    if (e.button !== 0) return;
    state.dragState = {
      isPanning: true,
      isDraggingNode: false,
      startX: e.clientX,
      startY: e.clientY,
      startPan: { ...state.pan },
    };
    document.body.classList.add('is-panning');

    const captureEl = target.closest('#viewport') ? viewport : stage;
    captureEl?.setPointerCapture?.(e.pointerId);
  }
}

function handlePointerMove(e) {
  const { isPanning, isDraggingNode, startX, startY, startPan, nodeStartPos, nodeId } = state.dragState;
  if (isPanning) {
    state.pan.x = startPan.x + (e.clientX - startX);
    state.pan.y = startPan.y + (e.clientY - startY);
    setTransform();
  } else if (isDraggingNode) {
    const node = byId(nodeId);
    if (!node) return;
    const dx = (e.clientX - startX) / state.scale;
    const dy = (e.clientY - startY) / state.scale;
    node.x = nodeStartPos.x + dx;
    node.y = nodeStartPos.y + dy;
    
    const nodeEl = viewport.querySelector(`.node[data-id="${node.id}"]`);
    if (nodeEl) {
        requestAnimationFrame(() => {
            nodeEl.style.left = `${node.x}px`;
            nodeEl.style.top = `${node.y}px`;
            renderWires(getVisibleNodes());
        });
    }
  }
}

function handlePointerUp(e) {
  if (state.dragState.isPanning) {
    document.body.classList.remove('is-panning');
    save();
  } else if (state.dragState.isDraggingNode) {
    const nodeEl = viewport.querySelector(`.node[data-id="${state.dragState.nodeId}"]`);
    if (nodeEl) nodeEl.style.cursor = 'grab';
    save();
  }
  if (stage?.hasPointerCapture?.(e.pointerId)) stage.releasePointerCapture(e.pointerId);
  if (viewport?.hasPointerCapture?.(e.pointerId)) viewport.releasePointerCapture(e.pointerId);
  state.dragState = { isPanning: false, isDraggingNode: false, nodeId: null };
}

window.addEventListener('pointerdown', handlePointerDown);
window.addEventListener('pointermove', handlePointerMove);
window.addEventListener('pointerup', handlePointerUp);

window.addEventListener('wheel', (e) => {
  if (!e.target.closest('#stage') || modal.style.display !== 'none') return;
  e.preventDefault();

  const delta = -e.deltaY;
  const zoomFactor = Math.exp(delta * 0.001);
  const prevScale = state.scale;
  const newScale = clamp(prevScale * zoomFactor, 0.2, 3);
  if (newScale === prevScale) return;

  const rect = viewport.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;

  state.pan.x = cx - (cx - state.pan.x) * (newScale / prevScale);
  state.pan.y = cy - (cy - state.pan.y) * (newScale / prevScale);
  state.scale = newScale;
  setTransform();
  save();
}, { passive: false });

// ----- Theme Management -----
function setupTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === 'light') {
        document.documentElement.dataset.theme = 'light';
    }
    themeToggleBtn.addEventListener('click', () => {
        const isLight = document.documentElement.hasAttribute('data-theme');
        if (isLight) {
            document.documentElement.removeAttribute('data-theme');
            localStorage.removeItem(THEME_KEY);
        } else {
            document.documentElement.dataset.theme = 'light';
            localStorage.setItem(THEME_KEY, 'light');
        }
    });
}

// ----- Misc Setup -----
function setupHelpWidget() {
    const isHelpCollapsed = localStorage.getItem('brainwave-help-collapsed') === 'true';
    if (isHelpCollapsed) helpWidget.classList.add('collapsed');
    helpToggleBtn.addEventListener('click', () => {
        const wasCollapsed = helpWidget.classList.toggle('collapsed');
        localStorage.setItem('brainwave-help-collapsed', wasCollapsed);
    });
}

// ----- Bindings & Initialization -----
document.getElementById('addChild').onclick = addChild;
document.getElementById('editNode').onclick = editSelected;
document.getElementById('deleteNode').onclick = deleteSelected;
lockNodeBtn.onclick = toggleLockSelected;
document.getElementById('layoutBtn').onclick = treeLayout;
document.getElementById('centerBtn').onclick = centerView;
document.getElementById('resetBtn').onclick = resetZoom;
document.getElementById('exportBtn').onclick = exportJSON;
document.getElementById('file').addEventListener('change', (e) => {
  if (!state.currentUserId) {
    e.target.value = '';
    return;
  }
  const f = e.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(reader.result);
      if (!obj || !Array.isArray(obj.nodes)) {
        throw new Error("Invalid format");
      }
      state.nodes = obj.nodes;
      state.nodes.forEach(n => {
          if (n.collapsed === undefined) n.collapsed = false;
          if (n.locked === undefined) n.locked = false;
      });
      state.nextId = inferNextId(state.nodes, obj.nextId);
      selectNode(null);
      save();
      render();
      centerView();
    } catch (err) {
      alert('Invalid or corrupted JSON file.');
      console.error("Import failed:", err);
    }
  };
  reader.readAsText(f);
  e.target.value = '';
});
colorPaletteContainer.addEventListener('click', (e) => {
  if (e.target.classList.contains('color-swatch')) {
    colorPaletteContainer.querySelector('.selected')?.classList.remove('selected');
    e.target.classList.add('selected');
  }
});
loginBtn?.addEventListener('click', signIn);
logoutBtn?.addEventListener('click', signOut);
authForm?.addEventListener('submit', handleAuthSubmit);
authToggleMode?.addEventListener('click', (e) => {
  e.preventDefault();
  state.authMode = state.authMode === 'signin' ? 'signup' : 'signin';
  updateAuthModal();
});
authCloseBtn?.addEventListener('click', closeAuthModal);
authModal?.addEventListener('click', (e) => {
  if (e.target === authModal) closeAuthModal();
});
document.getElementById('cancelBtn').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

function highlightSearchResults(term, { focusOnFirst = false } = {}) {
  const normalized = term.trim().toLowerCase();
  const matches = [];

  document.querySelectorAll('.node').forEach(el => {
    const node = byId(el.dataset.id);
    if (!node) return;
    const isMatch = normalized && node.title && node.title.toLowerCase().includes(normalized);
    el.classList.toggle('highlight', !!isMatch);
    if (isMatch) {
      matches.push(node);
    }
  });

  if (!focusOnFirst || !normalized || matches.length === 0) {
    return;
  }

  const targetNode = matches.find(n => n.id === state.selectedId) || matches[0];
  if (!targetNode) return;

  focusOnNode(targetNode);
  if (targetNode.id !== state.selectedId) {
    selectNode(targetNode.id);
  }
}

function handleSearchInputChange(e) {
  const term = e.target.value ?? '';
  state.searchTerm = term;

  if (searchInput && e.target !== searchInput && searchInput.value !== term) {
    searchInput.value = term;
  }
  if (mobileSearchInput && e.target !== mobileSearchInput && mobileSearchInput.value !== term) {
    mobileSearchInput.value = term;
  }

  highlightSearchResults(term, { focusOnFirst: true });
}

searchInput?.addEventListener('input', handleSearchInputChange);
mobileSearchInput?.addEventListener('input', handleSearchInputChange);

viewport.addEventListener('mouseover', (e) => {
    const nodeElement = e.target.closest('.node');
    if (nodeElement) {
        const hoveredNodeId = nodeElement.dataset.id;

        // Highlight incoming wire (from parent)
        const incomingWire = wiresSVG.querySelectorAll(`[data-child-id="${hoveredNodeId}"]`);
        incomingWire.forEach(el => el.classList.add('active'));

        // Highlight outgoing wires (to children)
        const children = childrenOf(hoveredNodeId);
        children.forEach(child => {
            const outgoingWire = wiresSVG.querySelectorAll(`[data-child-id="${child.id}"]`);
            outgoingWire.forEach(el => el.classList.add('active'));
        });
    }
});

viewport.addEventListener('dblclick', (e) => {
    if (modal.style.display !== 'none') return;
    const nodeElement = e.target.closest('.node');
    if (!nodeElement) return;

    const node = byId(nodeElement.dataset.id);
    if (!node || !node.url) return;

    const rawUrl = String(node.url).trim();
    if (!rawUrl) return;

    let href = rawUrl;
    try {
        href = new URL(rawUrl).href;
    } catch (err) {
        try {
            href = new URL(`https://${rawUrl}`).href;
        } catch (secondaryErr) {
            console.warn('Unable to open node URL', rawUrl, secondaryErr);
            return;
        }
    }

    const win = window.open(href, '_blank', 'noopener,noreferrer');
    if (win) win.opener = null;
});

viewport.addEventListener('mouseout', (e) => {
    const nodeElement = e.target.closest('.node');
    if (nodeElement) {
        const hoveredNodeId = nodeElement.dataset.id;

        // De-highlight incoming wire
        const incomingWire = wiresSVG.querySelectorAll(`[data-child-id="${hoveredNodeId}"]`);
        incomingWire.forEach(el => el.classList.remove('active'));

        // De-highlight outgoing wires
        const children = childrenOf(hoveredNodeId);
        children.forEach(child => {
            const outgoingWire = wiresSVG.querySelectorAll(`[data-child-id="${child.id}"]`);
            outgoingWire.forEach(el => el.classList.remove('active'));
        });
    }
});

window.addEventListener('keydown', (e) => {
    // Priority: Auth modal > Mobile menu > Other shortcuts
    if (e.key === 'Escape') {
        if (authModal && authModal.style.display !== 'none') {
            closeAuthModal();
            return;
        }
        if (toolbar && toolbar.classList.contains('mobile-menu-open')) {
            closeMobileMenu();
            return;
        }
    }
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') { e.preventDefault(); editSelected(); }
    if (e.key.toLowerCase() === 'a' || e.key === '+') { e.preventDefault(); addChild(); }
    if (e.key.toLowerCase() === 'l') { e.preventDefault(); toggleLockSelected(); }
});

function toggleMobileMenu() {
  if (!toolbar || !mobileMenuToggle) return;
  toolbar.classList.toggle('mobile-menu-open');
  mobileMenuToggle.classList.toggle('active');
  document.body.classList.toggle('mobile-menu-active');
}

function closeMobileMenu() {
  if (!toolbar || !mobileMenuToggle) return;
  toolbar.classList.remove('mobile-menu-open');
  mobileMenuToggle.classList.remove('active');
  document.body.classList.remove('mobile-menu-active');
}

function setupMobileMenu() {
  if (!mobileMenuToggle || !toolbar) return;
  
  // Toggle menu on button click
  mobileMenuToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMobileMenu();
  });
  
  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (toolbar.classList.contains('mobile-menu-open')) {
      if (!toolbar.contains(e.target) && !mobileMenuToggle.contains(e.target)) {
        closeMobileMenu();
      }
    }
  });
  
  // Escape key is handled in the main keydown handler above
  
  // Close menu when window is resized to desktop size
  window.addEventListener('resize', () => {
    if (window.innerWidth > 767) {
      closeMobileMenu();
    }
  });
  
  // Close menu when clicking on menu items (optional - for better UX)
  toolbar.addEventListener('click', (e) => {
    // Close menu if clicking on a button or link (but not on the toolbar itself)
    if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input[type="file"]')) {
      // Small delay to allow the click to register
      setTimeout(() => {
        if (window.innerWidth <= 767) {
          closeMobileMenu();
        }
      }, 100);
    }
  });
}

function init() {
  const hasLocalData = loadLocal();
  if (!hasLocalData || state.nodes.length === 0) {
    createRootIfNeeded();
  }
  setupTheme();
  setTransform();
  render();
  centerView();
  setupHelpWidget();
  setupMobileMenu(); // Initialize mobile menu
  updateAuthUI(); // Set initial UI state before auth loads
  initAuth();
}

document.addEventListener('DOMContentLoaded', init);
window.addEventListener('resize', render);
