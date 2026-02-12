import { config, state, dividerRegex, log, getStorageKey } from './state.js';

/**
 * 從 <a> 標籤中提取純文字名稱（不含 icon）
 */
function extractTextName(link) {
    // 找純文字節點（nodeType === 3），不包含 <span> 等元素
    const textNodes = Array.from(link.childNodes).filter(n => n.nodeType === 3);
    return textNodes.map(n => n.textContent).join('').trim();
}

/**
 * 設定 <a> 標籤的純文字內容（保留 icon）
 */
function setTextName(link, newText) {
    // 找到純文字節點並更新
    const textNodes = Array.from(link.childNodes).filter(n => n.nodeType === 3);
    if (textNodes.length > 0) {
        // 如果有多個文字節點，只改第一個（通常只有一個）
        textNodes[0].textContent = newText;
        // 清除其他文字節點
        for (let i = 1; i < textNodes.length; i++) {
            textNodes[i].textContent = '';
        }
    } else {
        // 沒有文字節點，新增一個
        link.appendChild(document.createTextNode(newText));
    }
}

/**
 * 判斷 LI 是不是標題
 * @returns headerInfo object or null
 */
function getGroupHeaderInfo(promptItem) {
  const link = promptItem.querySelector(config.selectors.promptLink);
  if (!link) return null;

  const itemId = promptItem.dataset.pmIdentifier;

  // 每次都重新讀取名稱（確保顯示最新的名稱）
  const currentName = extractTextName(link);

  // 檢查緩存中的名稱是否已過時
  const cachedName = state.originalNames.get(itemId);
  if (cachedName !== currentName) {
    log('Name changed for', itemId, ':', cachedName, '->', currentName);
    state.originalNames.set(itemId, currentName);
    // 只存 originalNames，不要覆蓋其他設定
    localStorage.setItem(getStorageKey(config.storageKeys.originalNames), JSON.stringify([...state.originalNames]));
  }

  const originalName = currentName;

  const createInfo = (name) => ({ originalName: name, stableKey: itemId });

  // 手動模式優先
  if (state.foldingMode === 'manual') {
    return state.manualHeaders.has(itemId) ? createInfo(originalName) : null;
  }

  // 原有的符號判斷（標準/包覆模式）
  return dividerRegex.test(originalName) ? createInfo(originalName) : null;
}

/**
 * [Helper] 建立群組的 DOM 結構
 */
function createGroupDOM(headerItem, headerInfo, contentItems) {
    const groupKey = headerInfo.stableKey;

    // 1. 記錄狀態
    const childIds = contentItems.map(item => item.dataset.pmIdentifier).filter(Boolean);
    state.groupHierarchy[groupKey] = childIds;
    state.groupHeaderStatus[groupKey] = !headerItem.classList.contains('completion_prompt_manager_prompt_disabled');

    // 2. 標記標題 Item
    headerItem.classList.add(config.classNames.isGroupHeader);

    // 3. 建立容器（必須先建立 details，才能在 link.onclick 中引用它）
    const details = document.createElement('details');
    details.className = config.classNames.group;
    details.open = state.openGroups[groupKey] !== false; // 預設開啟
    details.dataset.groupKey = groupKey;

    const link = headerItem.querySelector(config.selectors.promptLink);
    if (link) {
        // 重新讀取最新名稱（不使用 headerInfo 中可能過時的名稱）
        const latestName = extractTextName(link);
        // 設定名稱（保留 icon）
        setTextName(link, latestName);

        // 在 link 上阻止原生點擊行為（避免觸發 inspect）
        link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, true);
    }

    // 在 promptNameSpan 上加監聽，讓整個名稱區塊（4fr 欄位）都能點擊收闔
    const nameSpan = headerItem.querySelector(config.selectors.promptNameSpan);
    if (nameSpan) {
        nameSpan.addEventListener('click', (e) => {
            log('[NameSpan Click] target:', e.target);
            e.preventDefault();
            e.stopPropagation();
            details.open = !details.open;
            log('[NameSpan Click] toggled details.open to:', details.open);
        }, true); // capture 階段，比 link 先觸發，stopPropagation 會阻止 link 重複處理
    }

    // 4. 建立 Summary (標題列)
    const summary = document.createElement('summary');
    summary.onclick = (e) => {
        log('[Summary Click] target:', e.target);
        e.preventDefault();
        // 直接點到 summary（箭頭區域）時也觸發收闔
        if (e.target === summary) {
            details.open = !details.open;
            log('[Summary Click] toggled details.open to:', details.open);
        }
    };
    summary.appendChild(headerItem);
    details.appendChild(summary);

    // 5. 建立內容區
    const contentDiv = document.createElement('div');
    contentDiv.className = config.classNames.groupContent;
    contentItems.forEach(item => contentDiv.appendChild(item));
    details.appendChild(contentDiv);

    // 6. 監聽開關狀態
    details.ontoggle = () => {
        state.openGroups[groupKey] = details.open;
        localStorage.setItem(getStorageKey(config.storageKeys.openStates), JSON.stringify(state.openGroups));
    };

    return details;
}

/**
 * 主函式：重建列表
 */
export function buildCollapsibleGroups(listContainer) {
  // 強制同步最新的開關狀態
  state.openGroups = JSON.parse(localStorage.getItem(getStorageKey(config.storageKeys.openStates)) || '{}');

  log('Building collapsible groups, mode:', state.foldingMode);

  if (!listContainer || state.isProcessing) return;
  state.isProcessing = true;

  try {
    // 1. 先把所有項目拿出來，還原成乾淨的狀態
    const allItems = Array.from(listContainer.querySelectorAll(config.selectors.promptListItem));

    allItems.forEach(item => {
      item.classList.remove(config.classNames.isGroupHeader);
      // 讀取當前實際名稱（不要用舊緩存）
      const itemId = item.dataset.pmIdentifier;
      const link = item.querySelector(config.selectors.promptLink);
      if (link && itemId) {
        const currentName = extractTextName(link);
        // 更新緩存為當前名稱
        state.originalNames.set(itemId, currentName);
        // 不需要 setTextName，因為已經是當前名稱了
      }
    });

    // 保存更新後的名稱緩存（只存 originalNames，不要覆蓋其他設定）
    localStorage.setItem(getStorageKey(config.storageKeys.originalNames), JSON.stringify([...state.originalNames]));

    // 2. 清空並重置狀態
    listContainer.innerHTML = '';
    state.groupHierarchy = {};
    state.groupHeaderStatus = {};

    // 3. 沒啟用就直接塞回去
    if (!state.isEnabled) {
      allItems.forEach(item => listContainer.appendChild(item));
      return;
    }

    // --- 標準模式 (遇到標題就切分) ---
    const buildStandardGroups = () => {
      let buffer = [];
      let currentHeader = null;
      let currentHeaderInfo = null;

      const flushBuffer = () => {
        if (currentHeader) {
            listContainer.appendChild(createGroupDOM(currentHeader, currentHeaderInfo, buffer));
        } else {
            buffer.forEach(i => listContainer.appendChild(i)); // 沒標題的孤兒
        }
        buffer = [];
      };

      allItems.forEach(item => {
        const info = getGroupHeaderInfo(item);
        if (info) {
          flushBuffer(); // 把上一組結算掉
          currentHeader = item;
          currentHeaderInfo = info;
        } else {
          buffer.push(item);
        }
      });
      flushBuffer(); // 結算最後一組
    };

    // --- 包覆模式 (A...A 為一組) ---
    const buildSandwichGroups = () => {
      let remaining = [...allItems];

      while (remaining.length > 0) {
        const current = remaining.shift();
        const info = getGroupHeaderInfo(current);

        if (!info) {
          listContainer.appendChild(current); // 不是標題，直接放
          continue;
        }

        // 找配對的結束標題
        const closerIdx = remaining.findIndex(item => {
            const otherInfo = getGroupHeaderInfo(item);
            return otherInfo && otherInfo.originalName === info.originalName;
        });

        if (closerIdx !== -1) {
          // 抓出中間這整包 (含結束標題)
          const groupContent = remaining.splice(0, closerIdx + 1);
          listContainer.appendChild(createGroupDOM(current, info, groupContent));
        } else {
          listContainer.appendChild(current); // 找不到另一半，當孤兒
        }
      }
    };

    state.foldingMode === 'sandwich' ? buildSandwichGroups() : buildStandardGroups();

    // 補上禁用樣式
    applyGroupDisabledStyles(listContainer);

    log('Groups built, total groups:', Object.keys(state.groupHierarchy).length);

  } catch (err) {
    console.error('[PF] Oops, 分組壞了:', err);
  } finally {
    state.isProcessing = false;
  }
}

/**
 * 全收合/展開
 */
export function toggleAllGroups(listContainer, shouldOpen) {
  const details = listContainer.querySelectorAll(`.${config.classNames.group}`);
  details.forEach(el => el.open = shouldOpen);
  // 狀態就不一個個存了，下次重建時會自動更新
}

/**
 * 根據群組標頭的啟用狀態，為子項目應用或移除灰度樣式
 */
function applyGroupDisabledStyles(listContainer) {
    // 掃描所有群組，依據 Header 狀態對內容加 class
    listContainer.querySelectorAll(`.${config.classNames.group}`).forEach(group => {
        const key = group.dataset.groupKey;
        if (!key) return;

        const isDisabled = state.groupHeaderStatus[key] === false;
        const contentItems = group.querySelectorAll(`.${config.classNames.groupContent} > li`);

        contentItems.forEach(item => {
            item.classList.toggle('prompt-controlled-by-disabled-group', isDisabled);
        });
    });
}