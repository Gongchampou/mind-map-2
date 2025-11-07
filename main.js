/**
 * Brainwave - Visual Mind Mapper
 * A vanilla JS application for creating, organizing, and visualizing ideas.
 */

// ----- DOM Element References -----
const viewport = document.getElementById('viewport');
const wiresSVG = document.getElementById('wires');
const selTxt = document.getElementById('selTxt');
const searchInput = document.getElementById('search');
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

// ----- Constants -----
const SAVE_KEY = 'brainwave-mindmap-v2'; // Incremented version for new features
const THEME_KEY = 'brainwave-theme';
const COLORS = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899'];
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

// ----- Application State -----
const state = {
  nodes: [],
  selectedId: null,
  scale: 1,
  pan: { x: 0, y: 0 },
  nextId: 1,
  editingNodeId: null,
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
function save() {
  const payload = JSON.stringify({
    nodes: state.nodes.map(({ width, height, ...rest }) => rest),
    nextId: state.nextId,
    pan: state.pan,
    scale: state.scale,
    selectedId: state.selectedId,
  });
  localStorage.setItem(SAVE_KEY, payload);
}

function load() {
  const txt = localStorage.getItem(SAVE_KEY);
  if (!txt) return false;
  try {
    const obj = JSON.parse(txt);
    state.nodes = obj.nodes || [];
    // Ensure all nodes have the 'collapsed' and 'locked' property
    state.nodes.forEach(n => {
        if (n.collapsed === undefined) n.collapsed = false;
        if (n.locked === undefined) n.locked = false;
    });
    state.nextId = obj.nextId || 1;
    state.pan = obj.pan || { x: 0, y: 0 };
    state.scale = obj.scale || 1;
    state.selectedId = obj.selectedId || null;
    return true;
  } catch (e) {
    console.warn('Failed to load from localStorage', e);
    return false;
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

        el.className = `node color-${n.color || 9}` 
            + (state.selectedId === n.id ? ' selected' : '')
            + (n.locked ? ' locked' : '');

        el.style.left = `${n.x}px`;
        el.style.top = `${n.y}px`;

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
          ${hasChildren ? `<div class="node-collapse-toggle" title="${isCollapsed ? 'Expand' : 'Collapse'}">${isCollapsed ? '+' : '−'}</div>` : ''}
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
    const node = byId(state.selectedId);
    if (node) {
        node.locked = !node.locked;
        save();
        render(); // Re-render to update class, icon, and button states
    }
}

// ----- Modal & Form Logic -----
function openModal({ isNew = false, parentId = null } = {}) {
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
    const yOffset = (childrenOf(p.id).length * 120) - (childrenOf(p.id).length > 1 ? childrenOf(p.id).length * 60 : 0);
    state.nodes.push({ id, title, url, description, color, x: (p.x || 0) + 350, y: (p.y || 0) + yOffset, parentId: p.id, collapsed: false, locked: false });
    selectNode(id);
  }

  closeModal();
  save();
  render();
});

// ----- Commands & Layout -----
const addChild = () => openModal({ isNew: true, parentId: state.selectedId || 'root' });
const editSelected = () => { if (state.selectedId) openModal(); };

function deleteSelected() {
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

function resetZoom() { state.scale = 1; state.pan = { x: 0, y: 0 }; setTransform(); save(); render(); centerView(); }

// ----- Export / Import -----
function exportJSON() {
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
        toggleNodeCollapse(target.closest('.node').dataset.id);
        return;
    }

    const nodeElement = target.closest('.node');
    if (nodeElement) {
        const node = byId(nodeElement.dataset.id);
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
    } else if (target.closest('#viewport')) {
        state.dragState = {
            isPanning: true,
            isDraggingNode: false,
            startX: e.clientX,
            startY: e.clientY,
            startPan: { ...state.pan },
        };
        document.body.classList.add('is-panning');
        viewport.setPointerCapture(e.pointerId);
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
      state.nextId = obj.nextId || (Math.max(...state.nodes.map(n => typeof n.id === 'number' ? n.id : 0), 0) + 1);
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
document.getElementById('cancelBtn').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('.node').forEach(el => {
        const node = byId(el.dataset.id);
        if (node) {
            const isMatch = term && node.title.toLowerCase().includes(term);
            el.classList.toggle('highlight', isMatch);
        }
    });
});

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
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') { e.preventDefault(); editSelected(); }
    if (e.key.toLowerCase() === 'a' || e.key === '+') { e.preventDefault(); addChild(); }
    if (e.key.toLowerCase() === 'l') { e.preventDefault(); toggleLockSelected(); }
});

function init() {
  if (!load()) createRootIfNeeded();
  setupTheme();
  setTransform();
  render();
  centerView();
  setupHelpWidget();
}

document.addEventListener('DOMContentLoaded', init);
window.addEventListener('resize', render);
