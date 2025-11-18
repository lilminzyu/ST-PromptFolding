// --- 全域設定 ---
export const config = {
    // CSS 選擇器
    selectors: {
        appBody: 'body',
        promptList: '#completion_prompt_manager_list',
        promptListItem: 'li.completion_prompt_manager_prompt',
        promptLink: 'span.completion_prompt_manager_prompt_name',
        promptAsterisk: '.fa-asterisk',
        listHeader: '.completion_prompt_manager_list_head',
    },
    // localStorage 的鍵值
    storageKeys: {
        openStates: 'mingyu_collapsible_openStates',
        featureEnabled: 'mingyu_collapsible_featureEnabled',
        customDividers: 'mingyu_collapsible_customDividers',
        foldingMode: 'mingyu_collapsible_foldingMode',
        debugMode: 'mingyu_collapsible_debugMode', // 控制調試輸出
    },
    // CSS class 名稱
    classNames: {
        group: 'mingyu-prompt-group',
        groupContent: 'mingyu-prompt-group-content',
        isGroupHeader: 'is-group-header',
        controlledByDisabledGroup: 'prompt-controlled-by-disabled-group',
    },
    // 預設的分組標示
    defaultDividers: ['=', '-']
};

// --- 狀態管理 ---
export let state = {
    openGroups: JSON.parse(localStorage.getItem(config.storageKeys.openStates) || '{}'),
    isEnabled: localStorage.getItem(config.storageKeys.featureEnabled) !== 'false',
    isProcessing: false,
    observers: new WeakMap(),
    customDividers: JSON.parse(localStorage.getItem(config.storageKeys.customDividers) || 'null') || config.defaultDividers,
    foldingMode: localStorage.getItem(config.storageKeys.foldingMode) || 'standard',
    debugMode: localStorage.getItem(config.storageKeys.debugMode) === 'true',
    
    // 群組層級關係和狀態
    groupHierarchy: {}, // { 'group-key': ['child-id-1', 'child-id-2'] }
    groupHeaderStatus: {}, // { 'group-key': true/false }
};

/**
 * 條件式調試日誌
 */
export function debugLog(...args) {
    if (state.debugMode) {
        console.log('[PF]', ...args);
    }
}

/**
 * 動態生成分隔符正則表達式
 * @returns {RegExp}
 */
export function getDividerRegex() {
    const patterns = state.customDividers.map(pattern => {
        // 完全轉義所有特殊字元，當作普通字串處理
        return pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    return new RegExp(`^(${patterns.join('|')})`, 'i');
}

/**
 * 儲存自訂設定到 localStorage
 */
export function saveCustomSettings() {
    localStorage.setItem(config.storageKeys.customDividers, JSON.stringify(state.customDividers));
    localStorage.setItem(config.storageKeys.foldingMode, state.foldingMode);
}

/**
 * 儲存功能啟用狀態
 */
export function saveFeatureEnabled() {
    localStorage.setItem(config.storageKeys.featureEnabled, state.isEnabled);
}

/**
 * 儲存群組開合狀態
 */
export function saveOpenStates() {
    localStorage.setItem(config.storageKeys.openStates, JSON.stringify(state.openGroups));
}

/**
 * 重置群組狀態
 */
export function resetGroupState() {
    state.groupHierarchy = {};
    state.groupHeaderStatus = {};
}

/**
 * 更新群組層級關係
 * @param {string} groupKey 
 * @param {string} childId 
 */
export function addChildToGroup(groupKey, childId) {
    if (!state.groupHierarchy[groupKey]) {
        state.groupHierarchy[groupKey] = [];
    }
    state.groupHierarchy[groupKey].push(childId);
}

/**
 * 設置群組標頭狀態
 * @param {string} groupKey 
 * @param {boolean} isEnabled 
 */
export function setGroupHeaderStatus(groupKey, isEnabled) {
    state.groupHeaderStatus[groupKey] = isEnabled;
}