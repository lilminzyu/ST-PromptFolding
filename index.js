import { config, state, saveFeatureEnabled, debugLog } from './state.js';
import { buildCollapsibleGroups, toggleAllGroups } from './prompt-folding.js';
import { createSettingsPanel } from './settings-ui.js';

let promptManagerInstance = null;
let isHooked = false;

// 核心邏輯：雙層Observer架構
// 外層監控容器的出現，內層監控內容的變化
// 這是必要的，因為 SillyTavern 會完全重繪 DOM

/**
 * 監控器 #1: 監控列表「內部」的變化 (CRUD)
 * @param {HTMLElement} listContainer 
 */
function createListContentObserver(listContainer) {
    const existingObserver = state.observers.get(listContainer);
    if (existingObserver) {
        existingObserver.disconnect();
    }

    const observer = new MutationObserver((mutations) => {
        if (state.isProcessing) return;

        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                const hasChangedNodes = (nodes) => Array.from(nodes).some(node => 
                    node.nodeType === 1 && (
                        node.matches(config.selectors.promptListItem) || 
                        node.querySelector(config.selectors.promptListItem)
                    )
                );

                if (hasChangedNodes(mutation.addedNodes) || hasChangedNodes(mutation.removedNodes)) {
                    observer.disconnect();
                    try {
                        buildCollapsibleGroups(listContainer);
                    } finally {
                        setTimeout(() => {
                            observer.observe(listContainer, { childList: true, subtree: true });
                        }, 100);
                    }
                    return;
                }
            }
        }
    });

    observer.observe(listContainer, { childList: true, subtree: true });
    state.observers.set(listContainer, observer);
}

/**
 * 設置拖曳事件處理
 * @param {HTMLElement} listContainer 
 */
function setupDragHandlers(listContainer) {
    const restartObserver = () => {
        const observer = state.observers.get(listContainer);
        if (observer) {
            observer.observe(listContainer, { childList: true, subtree: true });
        }
    };

    listContainer.addEventListener('dragstart', (event) => {
        const draggedLi = event.target.closest(config.selectors.promptListItem);
        if (!draggedLi) return;
        
        const observer = state.observers.get(listContainer);
        if (observer) {
            observer.disconnect();
        }
    });

    listContainer.addEventListener('dragend', (event) => {
        setTimeout(() => {
            buildCollapsibleGroups(listContainer);
            restartObserver();
        }, 150);
    });
}

/**
 * 建立並掛載功能按鈕
 * @param {HTMLElement} listContainer
 */
function setupToggleButton(listContainer) {
    const header = document.querySelector('.completion_prompt_manager_header');
    if (!header) return;
    
    // 每次都先移除舊的，再添加新的，確保只有一組按鈕
    const oldControls = header.querySelector('.mingyu-collapse-controls');
    if (oldControls) {
        oldControls.remove();
    }

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'mingyu-collapse-controls';

    // 展開所有按鈕
    const expandAllBtn = createButton({
        className: 'menu_button mingyu-expand-all',
        title: '展開所有群組',
        text: '⬇️',
        onClick: () => toggleAllGroups(listContainer, true)
    });

    // 收合所有按鈕
    const collapseAllBtn = createButton({
        className: 'menu_button mingyu-collapse-all',
        title: '收合所有群組',
        text: '⬆️',
        onClick: () => toggleAllGroups(listContainer, false)
    });

    // 功能開關按鈕
    const toggleBtn = createButton({
        className: 'menu_button',
        title: state.isEnabled ? '點擊停用' : '點擊啟用',
        text: state.isEnabled ? '🟢' : '🔴',
        onClick: () => {
            state.isEnabled = !state.isEnabled;
            saveFeatureEnabled();
            toggleBtn.title = state.isEnabled ? '點擊停用' : '點擊啟用';
            toggleBtn.textContent = state.isEnabled ? '🟢' : '🔴';
            buildCollapsibleGroups(listContainer);
            debugLog('Feature toggled:', state.isEnabled);
        }
    });

    // 設定按鈕
    const settingsBtn = createButton({
        className: 'menu_button mingyu-settings-toggle',
        title: '分組設定',
        text: '⚙️',
        onClick: () => {
            const settingsPanel = document.getElementById('prompt-folding-settings');
            if (settingsPanel) {
                const isVisible = settingsPanel.style.display !== 'none';
                settingsPanel.style.display = isVisible ? 'none' : 'block';
                settingsBtn.classList.toggle('active', !isVisible);
            }
        }
    });

    buttonContainer.appendChild(expandAllBtn);
    buttonContainer.appendChild(collapseAllBtn);
    buttonContainer.appendChild(toggleBtn);
    buttonContainer.appendChild(settingsBtn);

    // 插入到 header 中
    const firstChild = header.firstElementChild;
    if (firstChild && firstChild.nextSibling) {
        header.insertBefore(buttonContainer, firstChild.nextSibling);
    } else {
        header.appendChild(buttonContainer);
    }
}

/**
 * 創建按鈕輔助函數
 * @param {object} options 
 * @returns {HTMLButtonElement}
 */
function createButton({ className, title, text, onClick }) {
    const button = document.createElement('button');
    button.className = className;
    button.title = title;
    button.textContent = text;
    button.addEventListener('click', onClick);
    return button;
}

/**
 * 核心初始化函式
 * 注意：每次都會重新創建 UI，這是必要的，因為 SillyTavern 會完全重繪 DOM
 * @param {HTMLElement} listContainer 
 */
function initialize(listContainer) {
    const promptManager = listContainer.closest('#completion_prompt_manager');
    if (!promptManager) return;

    debugLog('Initializing...');
    
    createSettingsPanel(promptManager);
    setupToggleButton(listContainer);
    buildCollapsibleGroups(listContainer);
    createListContentObserver(listContainer);
    setupDragHandlers(listContainer);
    initializePromptManagerHook();
}

/**
 * 監控器 #2: 全域、永續性的監控器，監控提示詞列表容器的「出現」
 */
function createContainerWatcher() {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;

                if (node.matches(config.selectors.promptList)) {
                    initialize(node);
                    return;
                }
                const list = node.querySelector(config.selectors.promptList);
                if (list) {
                    initialize(list);
                    return;
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    debugLog('Container watcher started');
}

/**
 * 初始化 promptManager Hook
 */
function initializePromptManagerHook() {
    if (isHooked) return;
    
    import('../../../../scripts/openai.js').then(module => {
        const { promptManager } = module;
        
        const checkReady = setInterval(() => {
            if (promptManager && promptManager.serviceSettings) {
                clearInterval(checkReady);
                promptManagerInstance = promptManager;
                hookPromptManager(promptManager);
                isHooked = true;
                debugLog('promptManager hooked successfully');
            }
        }, 100);
        
        setTimeout(() => clearInterval(checkReady), 5000);
    }).catch(err => {
        console.error('[PF] Failed to import promptManager:', err);
    });
}

/**
 * Hook PromptManager.getPromptCollection
 * @param {Object} promptManager 
 */
function hookPromptManager(promptManager) {
    const originalGetPromptCollection = promptManager.getPromptCollection.bind(promptManager);
    
    promptManager.getPromptCollection = function(generationType) {
        const collection = originalGetPromptCollection(generationType);
        
        if (!state.isEnabled) {
            return collection;
        }
        
        return filterPromptsByGroupStatus(collection, promptManager);
    };
    
    debugLog('Hook installed', {
        originalType: typeof originalGetPromptCollection,
        newType: typeof promptManager.getPromptCollection
    });
}

/**
 * 根據群組狀態過濾 PromptCollection
 * @param {Object} collection - PromptCollection 實例
 * @param {Object} promptManager - PromptManager 實例
 * @returns {Object} 過濾後的 PromptCollection
 */
function filterPromptsByGroupStatus(collection, promptManager) {
    debugLog('Filtering prompts by group status');
    
    updateGroupHeaderStatus(promptManager);
    
    const filteredPrompts = collection.collection.filter(prompt => {
        for (const [groupKey, childIds] of Object.entries(state.groupHierarchy)) {
            const isGroupDisabled = state.groupHeaderStatus[groupKey] === false;
            const isChildOfGroup = childIds.includes(prompt.identifier);
            
            if (isGroupDisabled && isChildOfGroup) {
                debugLog(`Filtering out: ${prompt.identifier} (in disabled group: ${groupKey})`);
                return false;
            }
        }
        return true;
    });
    
    collection.collection = filteredPrompts;
    
    debugLog('Filter results', {
        groupHierarchy: state.groupHierarchy,
        groupHeaderStatus: state.groupHeaderStatus,
        originalCount: collection.collection.length,
        filteredCount: filteredPrompts.length
    });
    
    return collection;
}

/**
 * 更新群組標頭的 enabled 狀態
 * @param {Object} promptManager 
 */
function updateGroupHeaderStatus(promptManager) {
    const character = promptManager.activeCharacter;
    if (!character) return;
    
    const promptOrder = promptManager.getPromptOrderForCharacter(character);
    
    for (const headerId of Object.keys(state.groupHierarchy)) {
        if (!headerId) continue;
        
        const entry = promptOrder.find(e => e.identifier === headerId);
        state.groupHeaderStatus[headerId] = entry?.enabled ?? true;
    }
}

// --- 程式進入點 ---
// 1. 立即檢查，應對已開啟的情況
const initialList = document.querySelector(config.selectors.promptList);
if (initialList) {
    initialize(initialList);
}

// 2. 啟動全域監控
createContainerWatcher();