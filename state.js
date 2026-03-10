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
    // CSS class 名稱
    classNames: {
        group: 'mingyu-prompt-group',
        groupContent: 'mingyu-prompt-group-content',
        isGroupHeader: 'is-group-header', // 加到作為標題的 li 元素上
    },
    // 預設的分組標示
    defaultDividers: ['=', '-'],
};

// 獲取當前 preset 名稱（從 DOM，不依賴全域 oai_settings）
export function getCurrentPresetName() {
    const select = document.querySelector('#settings_preset_openai');
    if (select) {
        const selected = select.querySelector(':checked');
        if (selected) return selected.textContent.trim();
    }
    return 'default';
}

// --- 狀態（初始為預設值，實際資料由 loadFromPreset 填入）---
export let state = {
    openGroups: {},
    isEnabled: true,
    customDividers: [...config.defaultDividers],
    foldingMode: 'manual',
    debugMode: false,
    manualHeaders: new Set(),
    originalNames: new Map(), // runtime-only cache，不寫入 preset

    // Runtime 狀態
    isProcessing: false,
    observers: new WeakMap(),
    groupHierarchy: {},
    groupHeaderStatus: {},
    isSelectingHeaders: false,
};

// 初始化 Regex
export let dividerRegex = buildDividerRegex();

// 建立分隔線 Regex (特殊字元自動跳脫)
export function buildDividerRegex() {
    const patterns = state.customDividers.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`^(${patterns.join('|')})`, 'i');
}

// Debug log 函式
export function log(...args) {
    if (state.debugMode) {
        console.log('[PF]', ...args);
    }
}

// --- savePreset fn cache（從 OAI_PRESET_CHANGED_BEFORE 事件取得）---
let _cachedSavePreset = null;

export function setCachedSavePreset(fn) {
    _cachedSavePreset = fn;
}

// --- 從 preset extensions 載入 state ---
export function loadFromPreset(pfData) {
    console.log('[PF] loadFromPreset called with:', JSON.stringify(pfData));
    // manualHeaders 支援純 UUID 陣列（新格式）或 {uuid,name} 物件陣列（舊格式）
    const rawHeaders = pfData?.manualHeaders ?? [];
    const uuids = rawHeaders.map(h => (typeof h === 'string' ? h : h?.uuid)).filter(Boolean);

    state.openGroups     = pfData?.openStates     ?? {};
    state.isEnabled      = pfData?.featureEnabled  ?? true;
    state.customDividers = pfData?.customDividers  ?? [...config.defaultDividers];
    state.foldingMode    = pfData?.foldingMode     ?? 'manual';
    state.debugMode      = pfData?.debugMode       ?? false;
    state.manualHeaders  = new Set(uuids);
    // originalNames 不從 preset 讀取，保持 runtime cache（由 prompt-folding.js 即時填入）
    state.originalNames  = new Map();

    dividerRegex = buildDividerRegex();
    log('loadFromPreset:', pfData ? `mode=${state.foldingMode}, headers=${uuids.length}` : 'no data, using defaults');
}

// --- 序列化 state 為可存進 preset 的格式 ---
export function getStateForSave() {
    return {
        openStates:     state.openGroups,
        featureEnabled: state.isEnabled,
        foldingMode:    state.foldingMode,
        customDividers: state.customDividers,
        debugMode:      state.debugMode,
        manualHeaders:  [...state.manualHeaders], // 純 UUID 陣列
    };
}

// --- 存到 preset JSON ---
export async function saveToPreset() {
    try {
        const [
            { oai_settings, getChatCompletionPreset, openai_settings: oaiSettingsArr, openai_setting_names },
            { getRequestHeaders },
        ] = await Promise.all([
            import('../../../../scripts/openai.js'),
            import('../../../../script.js'),
        ]);

        oai_settings.extensions = oai_settings.extensions || {};
        oai_settings.extensions.prompt_folding = getStateForSave();

        const name = getCurrentPresetName();
        console.log('[PF] saveToPreset — preset:', name, '| data:', JSON.stringify(oai_settings.extensions.prompt_folding));

        if (_cachedSavePreset) {
            console.log('[PF] saveToPreset: using cachedSavePreset');
            await _cachedSavePreset(name, oai_settings, false);
            console.log('[PF] saveToPreset: done');
        } else {
            console.log('[PF] saveToPreset: using fallback fetch');
            const preset = getChatCompletionPreset(oai_settings);
            const res = await fetch('/api/presets/save', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ apiId: 'openai', name, preset }),
            });
            if (!res.ok) {
                console.error('[PF] saveToPreset fallback: server returned', res.status, res.statusText);
                return;
            }
            const idx = openai_setting_names[name];
            console.log('[PF] saveToPreset fallback: saved OK, idx=', idx);
            if (idx !== undefined) Object.assign(oaiSettingsArr[idx], preset);
        }
        log('Saved to preset:', name);
    } catch (err) {
        console.error('[PF] saveToPreset failed:', err);
    }
}

// saveCustomSettings：向下相容，呼叫 saveToPreset（fire-and-forget）
export function saveCustomSettings() {
    saveToPreset().catch(err => console.error('[PF] Save failed:', err));
}

// --- 列出所有 preset 名稱（從 DOM dropdown）---
export function getAllPresetNames() {
    return Array.from(
        document.querySelectorAll('#settings_preset_openai option'),
    ).map(opt => opt.textContent.trim()).filter(Boolean);
}

// --- 取得指定 preset 的 folding config（供 copy 功能用）---
export async function exportConfigFromPreset(presetName) {
    const currentName = getCurrentPresetName();

    if (presetName === currentName) {
        return { ...getStateForSave(), sourcePreset: presetName };
    }

    // 從 ST in-memory globals 讀取
    try {
        const { openai_settings, openai_setting_names } = await import('../../../../scripts/openai.js');
        const idx        = openai_setting_names[presetName];
        const presetData = openai_settings?.[idx];
        const pfData     = presetData?.extensions?.prompt_folding;
        return pfData ? { ...pfData, sourcePreset: presetName } : null;
    } catch (err) {
        console.error('[PF] exportConfigFromPreset failed:', err);
        return null;
    }
}

// --- 將來源 preset 的設定套用到當前 preset（UUID 匹配）---
export async function importConfigToCurrentPreset(configData, currentPromptItems) {
    log('Importing config from', configData.sourcePreset, 'to', getCurrentPresetName());

    state.foldingMode    = configData.foldingMode    || 'manual';
    state.customDividers = configData.customDividers || config.defaultDividers;
    state.debugMode      = configData.debugMode      || false;

    // manualHeaders：支援純 UUID 或 {uuid, name} 兩種格式
    const rawHeaders = configData.manualHeaders || [];
    const srcUuids   = new Set(rawHeaders.map(h => (typeof h === 'string' ? h : h?.uuid)).filter(Boolean));

    const currentUuids = new Set(
        currentPromptItems.map(item => item.dataset.pmIdentifier).filter(Boolean),
    );

    const matched = [];
    const failed  = [];
    srcUuids.forEach(uuid => {
        if (currentUuids.has(uuid)) {
            matched.push(uuid);
        } else {
            failed.push(uuid);
        }
    });

    state.manualHeaders = new Set(matched);

    await saveToPreset();
    dividerRegex = buildDividerRegex();

    log('Import completed: matched', matched.length, 'failed', failed.length);
    return { byUuid: matched.length, failed };
}
