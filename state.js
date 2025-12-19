// --- 全域設定 ---
export const config = {
    // CSS 選擇器
    selectors: {
        appBody: 'body',
        promptList: '#completion_prompt_manager_list',
        promptListItem: 'li.completion_prompt_manager_prompt',
        promptLink: 'a.prompt-manager-inspect-action',  // 真正包含文字的 <a> 標籤
        promptNameSpan: 'span.completion_prompt_manager_prompt_name',  // 外層容器
        promptAsterisk: '.fa-asterisk', // 標題列要隱藏的星號
        listHeader: '.completion_prompt_manager_list_head',
    },
    // localStorage 的鍵值（會自動加上 preset 前綴）
    storageKeys: {
        openStates: 'openStates',
        featureEnabled: 'featureEnabled',
        customDividers: 'customDividers',
        foldingMode: 'foldingMode',
        debugMode: 'debugMode',
        manualHeaders: 'manualHeaders',
        originalNames: 'originalNames',
    },
    storagePrefix: 'mingyu_collapsible_', // 基本前綴
    // CSS class 名稱
    classNames: {
        group: 'mingyu-prompt-group',
        groupContent: 'mingyu-prompt-group-content',
        isGroupHeader: 'is-group-header', // 加到作為標題的 li 元素上
    },
    // 預設的分組標示
    defaultDividers: ['=', '-']
};

// 獲取當前 preset 名稱
export function getCurrentPresetName() {
    // 嘗試從全局變量獲取當前 preset
    if (typeof oai_settings !== 'undefined' && oai_settings.preset_settings_openai) {
        return oai_settings.preset_settings_openai;
    }
    // 嘗試從 DOM 獲取
    const select = document.querySelector('#settings_preset_openai');
    if (select) {
        const selected = select.querySelector(':checked');
        if (selected) return selected.textContent.trim();
    }
    // 降級：返回 'default'
    return 'default';
}

// 生成帶 preset 的 storage key
export function getStorageKey(key) {
    const presetName = getCurrentPresetName();
    return `${config.storagePrefix}${presetName}_${key}`;
}

// 從 localStorage 讀取（帶 preset）
// 注意：這個函數不能使用 log()，因為 state 還沒初始化
function loadFromStorage(key, defaultValue) {
    const storageKey = getStorageKey(key);
    const value = localStorage.getItem(storageKey);
    return value !== null ? value : defaultValue;
}

// --- 狀態 ---
export let state = {
    // 從 LocalStorage 讀取設定，沒讀到就用預設值
    openGroups: JSON.parse(loadFromStorage(config.storageKeys.openStates, '{}')),
    isEnabled: loadFromStorage(config.storageKeys.featureEnabled, 'true') !== 'false',
    customDividers: JSON.parse(loadFromStorage(config.storageKeys.customDividers, null)) || config.defaultDividers,
    foldingMode: loadFromStorage(config.storageKeys.foldingMode, 'manual'),
    debugMode: loadFromStorage(config.storageKeys.debugMode, 'false') === 'true',
    manualHeaders: new Set(JSON.parse(loadFromStorage(config.storageKeys.manualHeaders, '[]'))),
    originalNames: new Map(JSON.parse(loadFromStorage(config.storageKeys.originalNames, '[]'))),

    // Runtime 狀態
    isProcessing: false,
    observers: new WeakMap(),
    groupHierarchy: {},    // key: groupKey, value: [childId...]
    groupHeaderStatus: {}, // key: groupKey, value: boolean
    isSelectingHeaders: false,
    currentPreset: getCurrentPresetName(), // 記錄當前 preset
};

// 初始化 Regex
export let dividerRegex = buildDividerRegex();

// 建立分隔線 Regex (特殊字元自動跳脫)
export function buildDividerRegex() {
    const patterns = state.customDividers.map(p => p.replace(/[.*+?^${}()|[\\]/g, '\\$&'));
    return new RegExp(`^(${patterns.join('|')})`, 'i');
}

// Debug log 函式
export function log(...args) {
    if (state.debugMode) {
        console.log('[PF]', ...args);
    }
}

// 存設定並更新 Regex（帶 preset）
export function saveCustomSettings() {
    localStorage.setItem(getStorageKey(config.storageKeys.customDividers), JSON.stringify(state.customDividers));
    localStorage.setItem(getStorageKey(config.storageKeys.foldingMode), state.foldingMode);
    localStorage.setItem(getStorageKey(config.storageKeys.debugMode), state.debugMode);
    localStorage.setItem(getStorageKey(config.storageKeys.manualHeaders), JSON.stringify([...state.manualHeaders]));
    localStorage.setItem(getStorageKey(config.storageKeys.originalNames), JSON.stringify([...state.originalNames]));
    dividerRegex = buildDividerRegex();
    log('Settings saved for preset:', getCurrentPresetName());
}

// 重新載入設定（當 preset 切換時調用）
export function reloadSettings() {
    const newPreset = getCurrentPresetName();
    log('Reloading settings for preset:', newPreset);

    state.openGroups = JSON.parse(loadFromStorage(config.storageKeys.openStates, '{}'));
    state.isEnabled = loadFromStorage(config.storageKeys.featureEnabled, 'true') !== 'false';
    state.customDividers = JSON.parse(loadFromStorage(config.storageKeys.customDividers, null)) || config.defaultDividers;
    state.foldingMode = loadFromStorage(config.storageKeys.foldingMode, 'manual');
    state.debugMode = loadFromStorage(config.storageKeys.debugMode, 'false') === 'true';
    state.manualHeaders = new Set(JSON.parse(loadFromStorage(config.storageKeys.manualHeaders, '[]')));
    state.originalNames = new Map(JSON.parse(loadFromStorage(config.storageKeys.originalNames, '[]')));
    state.currentPreset = newPreset;

    dividerRegex = buildDividerRegex();
}

// 獲取所有可用的 preset 名稱
export function getAllPresetNames() {
    const presets = new Set();
    const prefix = config.storagePrefix;

    // 掃描 localStorage 中所有的 key
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
            // 解析出 preset 名稱
            // 格式: mingyu_collapsible_{presetName}_{settingKey}
            const match = key.match(new RegExp(`^${prefix}([^_]+)_`));
            if (match && match[1]) {
                presets.add(match[1]);
            }
        }
    }

    return Array.from(presets).sort();
}

// 從指定 preset 匯出配置（含名稱對照）
export function exportConfigFromPreset(presetName) {
    const getKey = (key) => `${config.storagePrefix}${presetName}_${key}`;

    const manualHeadersArray = JSON.parse(localStorage.getItem(getKey(config.storageKeys.manualHeaders)) || '[]');
    const originalNamesMap = new Map(JSON.parse(localStorage.getItem(getKey(config.storageKeys.originalNames)) || '[]'));

    // 將 manualHeaders 轉換為帶名稱的格式
    const manualHeadersWithNames = manualHeadersArray.map(uuid => ({
        uuid: uuid,
        name: originalNamesMap.get(uuid) || ''
    }));

    return {
        version: '2.4',
        sourcePreset: presetName,
        foldingMode: localStorage.getItem(getKey(config.storageKeys.foldingMode)) || 'manual',
        customDividers: JSON.parse(localStorage.getItem(getKey(config.storageKeys.customDividers)) || 'null') || config.defaultDividers,
        debugMode: localStorage.getItem(getKey(config.storageKeys.debugMode)) === 'true',
        manualHeaders: manualHeadersWithNames
    };
}

// 匯入配置到當前 preset（智能名稱匹配）
export function importConfigToCurrentPreset(configData, currentPromptItems) {
    log('Importing config from', configData.sourcePreset, 'to', getCurrentPresetName());

    // 1. 先匯入簡單的設定
    state.foldingMode = configData.foldingMode || 'manual';
    state.customDividers = configData.customDividers || config.defaultDividers;
    state.debugMode = configData.debugMode || false;

    // 2. 建立當前 preset 的名稱 -> UUID 對照表
    const nameToUuid = new Map();
    currentPromptItems.forEach(item => {
        const uuid = item.dataset.pmIdentifier;
        const name = state.originalNames.get(uuid);
        if (uuid && name) {
            nameToUuid.set(name, uuid);
        }
    });

    // 3. 智能匹配 manualHeaders
    const newManualHeaders = new Set();
    const matchResults = {
        byName: 0,
        byUuid: 0,
        failed: []
    };

    (configData.manualHeaders || []).forEach(header => {
        const { uuid: oldUuid, name } = header;

        // 優先用名稱匹配
        if (name && nameToUuid.has(name)) {
            const newUuid = nameToUuid.get(name);
            newManualHeaders.add(newUuid);
            matchResults.byName++;
            log(`Matched by name: "${name}" -> ${newUuid}`);
        }
        // 回退：嘗試 UUID 匹配（適用於同一個 preset 的情況）
        else if (oldUuid && currentPromptItems.some(item => item.dataset.pmIdentifier === oldUuid)) {
            newManualHeaders.add(oldUuid);
            matchResults.byUuid++;
            log(`Matched by UUID: ${oldUuid}`);
        }
        // 都匹配不到
        else {
            matchResults.failed.push(name || oldUuid);
            log(`Failed to match: "${name}" (${oldUuid})`);
        }
    });

    state.manualHeaders = newManualHeaders;

    // 4. 儲存設定
    saveCustomSettings();
    dividerRegex = buildDividerRegex();

    log('Import completed:', matchResults);
    return matchResults;
}
