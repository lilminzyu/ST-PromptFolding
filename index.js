import { config, state } from './state.js';
import { buildCollapsibleGroups, toggleAllGroups } from './prompt-folding.js';
import { createSettingsPanel } from './settings-ui.js';

let promptManagerInstance = null;
let isHooked = false;

// 核心邏輯：雙層Observer架構。

/**
 * 監控器 #1: 監控列表「內部」的變化 (crud)
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
                    node.nodeType === 1 && (node.matches(config.selectors.promptListItem) || node.querySelector(config.selectors.promptListItem))
                );

                if (hasChangedNodes(mutation.addedNodes) || hasChangedNodes(mutation.removedNodes)) {
                    observer.disconnect();
                    try {
                        buildCollapsibleGroups(listContainer);
                    } finally {
                        setTimeout(() => observer.observe(listContainer, { childList: true, subtree: true }), 100);
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

    const expandAllBtn = document.createElement('button');
    expandAllBtn.className = 'menu_button mingyu-expand-all';
    expandAllBtn.title = '展開所有群組';
    expandAllBtn.textContent = '⬇️';
    expandAllBtn.addEventListener('click', () => toggleAllGroups(listContainer, true));

    const collapseAllBtn = document.createElement('button');
    collapseAllBtn.className = 'menu_button mingyu-collapse-all';
    collapseAllBtn.title = '收合所有群組';
    collapseAllBtn.textContent = '⬆️';
    collapseAllBtn.addEventListener('click', () => toggleAllGroups(listContainer, false));

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'menu_button mingyu-settings-toggle';
    settingsBtn.title = '分組設定';
    settingsBtn.textContent = '⚙️';
    settingsBtn.addEventListener('click', () => {
        const settingsPanel = document.getElementById('prompt-folding-settings');
        if (settingsPanel) {
            const isVisible = settingsPanel.style.display !== 'none';
            settingsPanel.style.display = isVisible ? 'none' : 'block';
            settingsBtn.classList.toggle('active', !isVisible);
        }
    });

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'menu_button';
    const updateBtnText = () => {
        toggleBtn.title = state.isEnabled ? '點擊停用' : '點擊啟用';
        toggleBtn.textContent = state.isEnabled ? '🟢' : '🔴';
    };
    toggleBtn.addEventListener('click', () => {
        state.isEnabled = !state.isEnabled;
        localStorage.setItem(config.storageKeys.featureEnabled, state.isEnabled);
        updateBtnText();
        buildCollapsibleGroups(listContainer);
    });
    updateBtnText();

    buttonContainer.appendChild(expandAllBtn);
    buttonContainer.appendChild(collapseAllBtn);
    buttonContainer.appendChild(toggleBtn);
    buttonContainer.appendChild(settingsBtn);

    const firstChild = header.firstElementChild;
    if (firstChild && firstChild.nextSibling) {
        header.insertBefore(buttonContainer, firstChild.nextSibling);
    } else {
        header.appendChild(buttonContainer);
    }
}

/**
 * 核心初始化函式
 * @param {HTMLElement} listContainer 
 */
function initialize(listContainer) {
    const promptManager = listContainer.closest('#completion_prompt_manager');
    if (!promptManager) return;

    // 每次都重新建立UI，以應對SillyTavern的完全重繪
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
}

/**
 * 初始化 promptManager Hook
 */
function initializePromptManagerHook() {
    // 如果已經 Hook 過，直接返回
    if (isHooked) return;
    
    // 動態 import promptManager
    import('../../../../scripts/openai.js').then(module => {
        const { promptManager } = module;
        
        // 等待 promptManager 初始化完成
        const checkReady = setInterval(() => {
            if (promptManager && promptManager.serviceSettings) {
                clearInterval(checkReady);
                promptManagerInstance = promptManager;
                hookPromptManager(promptManager);
                isHooked = true;
                console.log('[PF] promptManager hooked successfully');
            }
        }, 100);
        
        // 超時保護
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
    // 保存原始方法
    const originalGetPromptCollection = 
        promptManager.getPromptCollection.bind(promptManager);
    
    // 覆蓋方法
    promptManager.getPromptCollection = function(generationType) {
        const collection = originalGetPromptCollection(generationType);
        
        // 如果功能未啟用，直接返回
        if (!state.isEnabled) {
            return collection;
        }
        
        // 過濾被群組關閉的 prompt
        return filterPromptsByGroupStatus(collection, promptManager);
    };
    console.log('[PF] Testing hook...');
console.log('[PF] Original method type:', typeof originalGetPromptCollection);
console.log('[PF] New method type:', typeof promptManager.getPromptCollection);
}

/**
 * 根據群組狀態過濾 PromptCollection
 * @param {Object} collection - PromptCollection 實例
 * @param {Object} promptManager - PromptManager 實例
 * @returns {Object} 過濾後的 PromptCollection
 */
function filterPromptsByGroupStatus(collection, promptManager) {
    console.log('[PF] Filtering prompts by group status');
    
    // 更新群組標頭狀態
    updateGroupHeaderStatus(promptManager);
    
    // 過濾 collection.collection 陣列
    const filteredPrompts = collection.collection.filter(prompt => {
        // 檢查這個 prompt 是否在某個關閉的群組中
        for (const [groupKey, childIds] of Object.entries(state.groupHierarchy)) {
            const isGroupDisabled = state.groupHeaderStatus[groupKey] === false;
            const isChildOfGroup = childIds.includes(prompt.identifier);
            
            if (isGroupDisabled && isChildOfGroup) {
                console.log(`[PF] Filtering out: ${prompt.identifier} (in disabled group: ${groupKey})`);
                return false; // 過濾掉
            }
        }
        
        return true; // 保留
    });
    
    // 重建 PromptCollection
    // 直接修改 collection.collection 而不是創建新實例
    collection.collection = filteredPrompts;

    console.log('[PF] Filter called');
console.log('[PF] groupHierarchy:', state.groupHierarchy);
console.log('[PF] groupHeaderStatus:', state.groupHeaderStatus);
console.log('[PF] Original prompts:', collection.collection.length);
    
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
    
    // 更新每個群組標頭的狀態
    for (const groupKey of Object.keys(state.groupHierarchy)) {
        // 從 groupKey 找到對應的 prompt identifier
        // 在 buildCollapsibleGroups 時記錄 groupKey -> headerId 的映射
        const headerId = state.groupKeyToHeaderId[groupKey];
        if (!headerId) continue;
        
        const entry = promptOrder.find(e => e.identifier === headerId);
        state.groupHeaderStatus[groupKey] = entry?.enabled ?? true;
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
