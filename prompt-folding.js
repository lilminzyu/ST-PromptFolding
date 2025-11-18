import { 
    config, 
    state, 
    getDividerRegex, 
    saveOpenStates,
    resetGroupState,
    addChildToGroup,
    setGroupHeaderStatus,
    debugLog
} from './state.js';

/**
 * 分析一個提示詞 LI 元素，判斷它是否為分組標題
 * @param {HTMLElement} promptItem - 提示詞的 LI 元素
 * @returns {object|null} 如果是標題，回傳標題資訊；否則回傳 null
 */
function getGroupHeaderInfo(promptItem) {
    const linkElement = promptItem.querySelector(config.selectors.promptLink);
    if (!linkElement) return null;

    const originalName = linkElement.textContent.trim();
    
    // 檢查是否匹配用戶定義的分隔符
    const dividerRegex = getDividerRegex();
    const match = dividerRegex.exec(originalName);
    if (match) {
        return createHeaderInfo(originalName, promptItem);
    }

    return null;
}

/**
 * 創建標題資訊物件
 * @param {string} name 
 * @param {HTMLElement} promptItem 
 * @returns {object}
 */
function createHeaderInfo(name, promptItem) {
    return {
        originalName: name,
        stableKey: promptItem.dataset.pmIdentifier,
    };
}

/**
 * 確保提示詞項目有 originalName 屬性
 * @param {HTMLElement} promptItem 
 */
function ensureOriginalName(promptItem) {
    if (!promptItem.dataset.originalName) {
        const linkElement = promptItem.querySelector(config.selectors.promptLink);
        if (linkElement) {
            promptItem.dataset.originalName = linkElement.textContent.trim();
        }
    }
}

/**
 * 還原提示詞項目的原始狀態
 * @param {HTMLElement} promptItem 
 */
function restoreOriginalState(promptItem) {
    promptItem.classList.remove(config.classNames.isGroupHeader);
    const link = promptItem.querySelector(config.selectors.promptLink);
    
    if (link && promptItem.dataset.originalName) {
        link.textContent = promptItem.dataset.originalName;
    }
}

/**
 * 創建群組 details 元素
 * @param {object} headerInfo - 標題資訊
 * @param {HTMLElement} headerItem - 標題的 LI 元素
 * @param {HTMLElement[]} childItems - 子項目陣列
 * @returns {HTMLDetailsElement}
 */
function createGroupDetailsElement(headerInfo, headerItem, childItems = []) {
    const groupKey = headerInfo.stableKey;
    
    // 記錄群組狀態
    setGroupHeaderStatus(groupKey, !headerItem.classList.contains('completion_prompt_manager_prompt_disabled'));
    childItems.forEach(item => {
        const childId = item.dataset.pmIdentifier;
        if (childId) addChildToGroup(groupKey, childId);
    });
    
    // 標記為標題
    headerItem.classList.add(config.classNames.isGroupHeader);
    
    // 創建 details 元素
    const details = document.createElement('details');
    details.className = config.classNames.group;
    details.open = state.openGroups[headerInfo.stableKey] !== false;
    details.dataset.groupKey = groupKey;
    
    // 創建 summary
    const summary = document.createElement('summary');
    const link = headerItem.querySelector(config.selectors.promptLink);
    if (link) {
        link.textContent = headerInfo.originalName;
        // 只讓文字可以點擊切換開合
        link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            details.open = !details.open;
        });
    }
    // 防止點擊 summary 的其他地方導致開合
    summary.addEventListener('click', (e) => e.preventDefault());
    summary.appendChild(headerItem);
    details.appendChild(summary);
    
    // 創建內容容器
    const groupContent = document.createElement('div');
    groupContent.className = config.classNames.groupContent;
    childItems.forEach(item => groupContent.appendChild(item));
    details.appendChild(groupContent);
    
    // 監聽開合狀態變化
    details.addEventListener('toggle', () => {
        state.openGroups[headerInfo.stableKey] = details.open;
        saveOpenStates();
    });
    
    return details;
}

/**
 * 標準模式：從標題開始摺疊後續所有項目直到下一個標題
 * @param {HTMLElement[]} allItems 
 * @param {HTMLElement} listContainer 
 */
function buildStandardGroups(allItems, listContainer) {
    let currentGroupKey = null;
    let currentHeaderInfo = null;
    let currentHeaderItem = null;
    let childItems = [];

    allItems.forEach((item) => {
        const headerInfo = getGroupHeaderInfo(item);
        
        if (headerInfo) {
            // 如果有未完成的群組，先添加到容器
            if (currentHeaderInfo && currentHeaderItem) {
                const details = createGroupDetailsElement(currentHeaderInfo, currentHeaderItem, childItems);
                listContainer.appendChild(details);
            }
            
            // 開始新群組
            currentHeaderInfo = headerInfo;
            currentHeaderItem = item;
            currentGroupKey = headerInfo.stableKey;
            childItems = [];
        } else if (currentHeaderInfo) {
            // 這是當前群組的子項目
            childItems.push(item);
        } else {
            // 沒有群組，直接添加
            listContainer.appendChild(item);
        }
    });
    
    // 處理最後一個群組
    if (currentHeaderInfo && currentHeaderItem) {
        const details = createGroupDetailsElement(currentHeaderInfo, currentHeaderItem, childItems);
        listContainer.appendChild(details);
    }
}

/**
 * 包覆模式：尋找成對的標題並摺疊中間的內容
 * @param {HTMLElement[]} allItems 
 * @param {HTMLElement} listContainer 
 */
function buildSandwichGroups(allItems, listContainer) {
    let itemsToProcess = [...allItems];
    const nodesToAdd = [];

    while (itemsToProcess.length > 0) {
        const currentItem = itemsToProcess.shift();
        const headerInfo = getGroupHeaderInfo(currentItem);

        if (!headerInfo) {
            nodesToAdd.push(currentItem);
            continue;
        }

        // 尋找配對的結束標頭
        const closingHeaderIndex = itemsToProcess.findIndex((item) => {
            const otherHeader = getGroupHeaderInfo(item);
            return otherHeader && otherHeader.originalName === headerInfo.originalName;
        });

        if (closingHeaderIndex !== -1) {
            // 找到配對，創建群組
            const contentItems = itemsToProcess.splice(0, closingHeaderIndex + 1);
            const details = createGroupDetailsElement(headerInfo, currentItem, contentItems);
            nodesToAdd.push(details);
        } else {
            // 找不到配對，當作普通項目
            nodesToAdd.push(currentItem);
        }
    }
    
    nodesToAdd.forEach(node => listContainer.appendChild(node));
}

/**
 * 核心函式：將提示詞列表整理成可摺疊的群組
 * @param {HTMLElement} listContainer - 提示詞列表的 UL 容器
 */
export function buildCollapsibleGroups(listContainer) {
    // 強制從 localStorage 同步最新的開合狀態
    state.openGroups = JSON.parse(
        localStorage.getItem(config.storageKeys.openStates) || '{}'
    );

    if (!listContainer || state.isProcessing) return;

    state.isProcessing = true;

    try {
        // 1. 收集並還原所有項目
        const allItems = Array.from(
            listContainer.querySelectorAll(config.selectors.promptListItem)
        );
        
        allItems.forEach(item => {
            ensureOriginalName(item);
            restoreOriginalState(item);
        });

        // 2. 清空容器和狀態
        listContainer.innerHTML = '';
        resetGroupState();

        // 3. 根據功能狀態決定如何重建
        if (!state.isEnabled) {
            // 功能關閉：直接還原所有項目
            allItems.forEach(item => listContainer.appendChild(item));
        } else {
            // 功能開啟：根據模式分組
            if (state.foldingMode === 'sandwich') {
                buildSandwichGroups(allItems, listContainer);
            } else {
                buildStandardGroups(allItems, listContainer);
            }
        }
        
        // 4. 應用群組禁用樣式
        applyGroupDisabledStyles(listContainer);
        
        debugLog('Groups built successfully', {
            mode: state.foldingMode,
            groupCount: Object.keys(state.groupHierarchy).length
        });
        
    } catch (error) {
        console.error('[PF] 分組過程發生錯誤:', error);
    } finally {
        state.isProcessing = false;
    }
}

/**
 * 展開或收合所有群組
 * @param {HTMLElement} listContainer
 * @param {boolean} shouldOpen - true 展開，false 收合
 */
export function toggleAllGroups(listContainer, shouldOpen) {
    const allGroups = listContainer.querySelectorAll(`.${config.classNames.group}`);
    if (!allGroups.length) return;

    allGroups.forEach(details => {
        details.open = shouldOpen;
        const groupKey = details.dataset.groupKey;
        if (groupKey) state.openGroups[groupKey] = shouldOpen;
    });

    saveOpenStates();
    debugLog(`All groups ${shouldOpen ? 'expanded' : 'collapsed'}`);
}

/**
 * 根據群組標頭的啟用狀態，為子項目應用樣式
 * @param {HTMLElement} listContainer 
 */
function applyGroupDisabledStyles(listContainer) {
    const allGroups = listContainer.querySelectorAll(`.${config.classNames.group}`);
    
    allGroups.forEach(details => {
        const groupKey = details.dataset.groupKey;
        if (!groupKey) return;

        const headerIsEnabled = state.groupHeaderStatus[groupKey];
        const contentItems = details.querySelectorAll(
            `.${config.classNames.groupContent} > li.completion_prompt_manager_prompt`
        );
        
        contentItems.forEach(item => {
            if (headerIsEnabled === false) {
                item.classList.add(config.classNames.controlledByDisabledGroup);
            } else {
                item.classList.remove(config.classNames.controlledByDisabledGroup);
            }
        });
    });
}