import { config, state, log, getStorageKey } from './state.js';
import { buildCollapsibleGroups, toggleAllGroups } from './prompt-folding.js';
import { createSettingsPanel } from './settings-ui.js';

let isHooked = false;

// --- 1. 觀察者邏輯 ---

// 監控列表「內部」CRUD 變化
function createListContentObserver(listContainer) {
    if (state.observers.has(listContainer)) state.observers.get(listContainer).disconnect();

    const observer = new MutationObserver((mutations) => {
        if (state.isProcessing) return;

        const isPromptNode = (n) => n.nodeType === 1 && (n.matches(config.selectors.promptListItem) || n.querySelector(config.selectors.promptListItem));

        const shouldRebuild = mutations.some(m => {
            // childList: 新增/刪除節點
            if (m.type === 'childList' && (Array.from(m.addedNodes).some(isPromptNode) || Array.from(m.removedNodes).some(isPromptNode))) {
                log('Detected childList change, rebuilding');
                return true;
            }
            // characterData: 文字內容變更（條目名稱改了）
            // 注意：不需要刪除緩存，buildCollapsibleGroups 會自動更新
            if (m.type === 'characterData') {
                const target = m.target.parentElement;
                if (target && target.matches(config.selectors.promptLink)) {
                    log('Prompt name changed, rebuilding');
                    return true;
                }
            }
            return false;
        });

        if (shouldRebuild) {
            observer.disconnect();
            buildCollapsibleGroups(listContainer);
            // 稍微延遲後重新掛載，避免連續觸發
            setTimeout(() => observer.observe(listContainer, { childList: true, subtree: true, characterData: true }), 100);
        }
    });

    observer.observe(listContainer, { childList: true, subtree: true, characterData: true });
    state.observers.set(listContainer, observer);
}

// 處理拖曳 (拖曳時暫停監控，拖完重整)
function setupDragHandlers(listContainer) {
    listContainer.addEventListener('dragstart', (e) => {
        if (e.target.closest(config.selectors.promptListItem)) {
            state.observers.get(listContainer)?.disconnect();
        }
    });

    listContainer.addEventListener('dragend', () => {
        setTimeout(() => {
            buildCollapsibleGroups(listContainer);
            state.observers.get(listContainer)?.observe(listContainer, { childList: true, subtree: true, characterData: true });
        }, 150);
    });
}


// --- 2. UI 按鈕邏輯 ---

// Helper: 快速建立按鈕
function createBtn(icon, title, onClick, className = '') {
    const btn = document.createElement('button');
    btn.className = `menu_button ${className}`;

    if (icon.startsWith('fa-')) {
        const i = document.createElement('i');
        i.className = `fa-solid ${icon}`;
        btn.appendChild(i);
    } else {
        btn.textContent = icon;
    }

    btn.title = title;
    btn.onclick = onClick;
    return btn;
}

function setupToggleButton(listContainer) {
    const header = document.querySelector('.completion_prompt_manager_header');
    if (!header) return;

    header.querySelector('.mingyu-collapse-controls')?.remove();

    const container = document.createElement('div');
    container.className = 'mingyu-collapse-controls';

    // 功能按鈕
    container.append(
        createBtn('fa-expand', '展開所有', () => {
            log('Expand all button clicked');
            toggleAllGroups(listContainer, true);
        }, 'mingyu-expand-all'),
        createBtn('fa-compress', '收合所有', () => {
            log('Collapse all button clicked');
            toggleAllGroups(listContainer, false);
        }, 'mingyu-collapse-all')
    );

    // 開關按鈕
    const toggleBtn = createBtn('', '', () => {
        state.isEnabled = !state.isEnabled;
        localStorage.setItem(getStorageKey(config.storageKeys.featureEnabled), state.isEnabled);
        log('Feature toggled:', state.isEnabled);
        updateToggleState();
        buildCollapsibleGroups(listContainer);
    });

    const updateToggleState = () => {
        toggleBtn.textContent = state.isEnabled ? '🟢' : '🔴';
        toggleBtn.title = state.isEnabled ? '點擊停用' : '點擊啟用';
    };
    updateToggleState();
    container.append(toggleBtn);

    // 設定按鈕
    const settingsBtn = createBtn('⚙️', '分組設定', () => {
        log('Settings button clicked');
        const panel = document.getElementById('prompt-folding-settings');
        if (panel) {
            const isHidden = panel.style.display === 'none';
            panel.style.display = isHidden ? 'block' : 'none';
            settingsBtn.classList.toggle('active', isHidden);
        }
    }, 'mingyu-settings-toggle');
    container.append(settingsBtn);

    // 插入 Header
    const target = header.firstElementChild?.nextSibling || header.firstChild;
    header.insertBefore(container, target);
}

// --- 3. Hook 核心邏輯 (效能優化版) ---

function hookPromptManager(pm) {
    const originalGet = pm.getPromptCollection.bind(pm);

    pm.getPromptCollection = function(type) {
        const collection = originalGet(type);
        if (!state.isEnabled) return collection;

        // 更新 Header 狀態並過濾被禁用的子項
        updateGroupHeaderStatus(pm);

        // 建立被禁用 ID 的 Set (O(1) lookup)
        const disabledIds = new Set();
        for (const [groupKey, childIds] of Object.entries(state.groupHierarchy)) {
            if (state.groupHeaderStatus[groupKey] === false) {
                childIds.forEach(id => disabledIds.add(id));
            }
        }

        // 過濾
        if (disabledIds.size > 0) {
            collection.collection = collection.collection.filter(p => !disabledIds.has(p.identifier));
        }

        return collection;
    };
    log('Hook installed.');
}

function updateGroupHeaderStatus(pm) {
    const char = pm.activeCharacter;
    if (!char) return;
    
    // 從 Prompt Order 檢查 Header 目前有沒有被啟用
    const order = pm.getPromptOrderForCharacter(char);
    Object.keys(state.groupHierarchy).forEach(headerId => {
        const entry = order.find(e => e.identifier === headerId);
        if (entry) state.groupHeaderStatus[headerId] = entry.enabled;
    });
}

// --- 4. 初始化與進入點 ---

function initialize(listContainer) {
    const pmWrapper = listContainer.closest('#completion_prompt_manager');
    if (!pmWrapper) return;

    log('Initializing Prompt Folding...');

    createSettingsPanel(pmWrapper, listContainer);
    setupToggleButton(listContainer);
    buildCollapsibleGroups(listContainer);
    createListContentObserver(listContainer);
    setupDragHandlers(listContainer);

    log('Initialization completed');

    // 嘗試 Hook
    if (!isHooked) {
        log('Attempting to install hook...');
        import('../../../../scripts/openai.js').then(m => {
            const check = setInterval(() => {
                if (m.promptManager?.serviceSettings) {
                    clearInterval(check);
                    hookPromptManager(m.promptManager);
                    isHooked = true;
                }
            }, 100);
            setTimeout(() => clearInterval(check), 5000);
        });
    }
}

// 全域監控：等 ST 畫出列表
const globalObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
        for (const node of m.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (node.matches(config.selectors.promptList)) return initialize(node);
            const list = node.querySelector(config.selectors.promptList);
            if (list) return initialize(list);
        }
    }
});
globalObserver.observe(document.body, { childList: true, subtree: true });

// 如果腳本跑太慢，列表已經在畫面上了，就手動觸發一次
const initialList = document.querySelector(config.selectors.promptList);
if (initialList) initialize(initialList);