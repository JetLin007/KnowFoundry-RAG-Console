/**
 * KnowFoundry RAG Console - 主应用逻辑
 * 负责初始化、事件绑定、会话管理、消息发送
 */

// ============================================
// 全局状态引用
// ============================================

// 引用 state 和 els（在 state.js 中定义）

// ============================================
// 核心函数 - sendMessage（暴露为全局）
// ============================================

/**
 * 发送消息（通过 WebSocket）
 * 暴露为全局函数，供其他模块调用
 */
window.sendMessage = function() {
    const input = els.chatInput;
    if (!input) return;
    
    const query = input.value.trim();
    if (!query) return;
    
    if (state.inProgress) {
        console.warn('已有进行中的请求');
        return;
    }
    
    // 检查 WebSocket 连接
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
        console.warn('WebSocket 未连接，尝试重新连接');
        // 尝试重新连接
        if (typeof initWebSocket === 'function') {
            initWebSocket();
            setTimeout(() => {
                if (state.socket && state.socket.readyState === WebSocket.OPEN) {
                    window.sendMessage();
                }
            }, 500);
        }
        return;
    }
    
    // 设置状态
    state.inProgress = true;
    state.cancelled = false;
    state.lastStreamStatus = '发送中...';
    updateSideStats();
    setConnectionState('working', '生成中');
    
    // 清空输入框
    input.value = '';
    input.dispatchEvent(new Event('input'));
    
    // 添加用户消息到界面
    addUserMessage(query);
    
    // 添加占位消息
    const placeholderId = addPlaceholderMessage();
    
    // 获取当前场景和过滤条件
    const scenarioId = state.scenarioId || 'enterprise_knowledge';
    const sourceFilter = els.sourceFilter ? els.sourceFilter.value : '';
    const tenant = els.tenantInput ? els.tenantInput.value.trim() || 'default' : 'default';
    const dataset = els.datasetInput ? els.datasetInput.value.trim() || 'default' : 'default';
    const visibility = els.visibilitySelect ? els.visibilitySelect.value : 'public';
    const userRole = els.roleSelect ? els.roleSelect.value : 'public';
    
    // 构建消息
    const message = {
        query: query,
        source_filter: sourceFilter,
        session_id: state.sessionId,
        scenario_id: scenarioId,
        tenant_id: tenant,
        dataset_id: dataset,
        visibility: visibility,
        user_role: userRole
    };
    
    // 发送 WebSocket 消息
    try {
        state.socket.send(JSON.stringify(message));
        state.lastStreamStatus = '已发送';
        updateSideStats();
    } catch (e) {
        console.error('发送消息失败:', e);
        state.inProgress = false;
        setConnectionState('error', '异常');
        removePlaceholderMessage(placeholderId);
        addErrorMessage('发送失败，请重试');
    }
};

/**
 * 取消当前流式响应
 */
window.cancelStream = function() {
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.cancelled = true;
        state.inProgress = false;
        state.lastStreamStatus = '已取消';
        updateSideStats();
        setConnectionState('ready', '就绪');
        try {
            state.socket.send(JSON.stringify({ type: 'cancel' }));
        } catch (e) {
            // 忽略
        }
    }
};

// ============================================
// UI 辅助函数
// ============================================

function addUserMessage(text) {
    const container = document.getElementById('chatHistory');
    if (!container) return;
    
    const div = document.createElement('div');
    div.className = 'message user-message';
    div.innerHTML = `<div class="message-content">${escapeHtml(text)}</div>`;
    container.appendChild(div);
    scrollToBottom();
}

function addPlaceholderMessage() {
    const container = document.getElementById('chatHistory');
    if (!container) return;
    
    const div = document.createElement('div');
    div.className = 'message assistant-message placeholder';
    div.id = 'placeholder-' + Date.now();
    div.innerHTML = `<div class="message-content"><span class="typing-indicator">...</span></div>`;
    container.appendChild(div);
    scrollToBottom();
    return div.id;
}

function removePlaceholderMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function addErrorMessage(text) {
    const container = document.getElementById('chatHistory');
    if (!container) return;
    
    const div = document.createElement('div');
    div.className = 'message error-message';
    div.innerHTML = `<div class="message-content">❌ ${escapeHtml(text)}</div>`;
    container.appendChild(div);
    scrollToBottom();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function scrollToBottom() {
    const container = document.getElementById('chatHistory');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

function updateSideStats() {
    const statsEl = document.getElementById('sideStats');
    if (statsEl) {
        statsEl.innerHTML = `
            <div><span>状态</span><strong>${state.lastStreamStatus || '等待中'}</strong></div>
            <div><span>命中</span><strong>${state.lastHitType || '-'}</strong></div>
            <div><span>来源数</span><strong>${state.lastSourceCount || 0}</strong></div>
            ${state.lastTraceId ? `<div><span>Trace ID</span><strong style="font-size:11px;">${state.lastTraceId}</strong></div>` : ''}
        `;
    }
}

function setConnectionState(type, text) {
    const pill = document.getElementById('connectionPill');
    if (!pill) return;
    pill.className = `pill ${type}`;
    const span = pill.querySelector('span:last-child');
    if (span) span.textContent = text;
}

// ============================================
// 应用初始化
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('应用初始化开始...');
    bindEvents();
    bindInsightCardToggles();
    
    // 加载场景（使用 scenario.js 中的实现）
    if (typeof window.loadScenarios === 'function' && window.loadScenarios !== loadScenarios) {
        await window.loadScenarios();
    } else {
        console.warn('window.loadScenarios 不可用，尝试使用 scenario.js');
        // 尝试调用 scenario.js 中的 loadScenarios
        if (typeof loadScenarios === 'function') {
            await loadScenarios();
        }
    }
    
    // 加载会话
    if (typeof loadSessionCards === 'function') {
        loadSessionCards();
    }
    if (typeof renderSessionCards === 'function') {
        renderSessionCards();
    }
    
    const restored = await restoreLatestSessionForScenario();
    if (!restored) {
        await createNewSession();
    }
    
    // 加载模板列表
    if (typeof loadTemplates === 'function') {
        loadTemplates();
    }
    console.log('应用初始化完成');
});

// ============================================
// 事件绑定
// ============================================

function bindEvents() {
    els.newSessionBtn?.addEventListener('click', createNewSession);
    els.sidebarNewSessionBtn?.addEventListener('click', createNewSession);
    els.clearHistoryBtn?.addEventListener('click', clearHistory);
    
    els.sendBtn.addEventListener('click', () => {
        if (state.inProgress) {
            window.cancelStream();
        } else {
            window.sendMessage();
        }
    });
    
    els.scenarioSelect?.addEventListener('change', async () => {
        if (state.inProgress) window.cancelStream();
        if (typeof applyScenario === 'function') {
            await applyScenario(els.scenarioSelect.value, true);
        }
    });
    
    [els.sourceFilter, els.tenantInput, els.datasetInput, els.visibilitySelect, els.roleSelect].forEach(item => {
        item?.addEventListener('change', updateScopeDisplay);
        item?.addEventListener('input', updateScopeDisplay);
    });
    
    els.sourceFilter?.addEventListener('change', updateCategoryActive);
    els.sessionSearchInput?.addEventListener('input', filterHistory);
    
    els.chatInput.addEventListener('input', autoResizeInput);
    els.chatInput.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (!state.inProgress) {
                window.sendMessage();
            }
        }
    });
}

function bindInsightCardToggles() {
    document.querySelectorAll('.right-panel .insight-card').forEach(card => {
        const title = card.querySelector('.side-section-title');
        const icon = card.querySelector('.card-toggle-icon');
        if (!title || !icon) return;
        title.setAttribute('role', 'button');
        title.setAttribute('tabindex', '0');
        title.setAttribute('aria-expanded', 'true');
        icon.setAttribute('aria-hidden', 'true');
        const toggle = () => {
            const collapsed = card.classList.toggle('is-collapsed');
            title.setAttribute('aria-expanded', String(!collapsed));
        };
        title.addEventListener('click', toggle);
        title.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggle();
            }
        });
    });
}

// ============================================
// 会话管理函数（占位，由其他模块实现）
// ============================================

async function restoreLatestSessionForScenario() {
    if (typeof window.restoreLatestSessionForScenario === 'function') {
        return window.restoreLatestSessionForScenario();
    }
    return false;
}

async function createNewSession() {
    if (typeof window.createNewSession === 'function') {
        return window.createNewSession();
    }
    return false;
}

// ============================================
// 修复 loadSessionCards - 避免无限递归
// ============================================

// function loadSessionCards() {
//     // 防止重复加载
//     if (state._sessionCardsLoading) {
//         return;
//     }
//     state._sessionCardsLoading = true;
//     
//     try {
//         // 从 API 加载会话卡片
//         if (typeof window._loadSessionCardsImpl === 'function') {
//             window._loadSessionCardsImpl();
//         } else if (typeof loadSessionCardsFromApi === 'function') {
//             loadSessionCardsFromApi();
//         } else {
//             // 简单实现：从 history API 加载
//             const historyList = document.getElementById('historyList');
//             if (historyList && state.sessionId) {
//                 fetch(`/api/history/${state.sessionId}`)
//                     .then(r => r.json())
//                     .then(data => {
//                         state.historyItems = data.history || [];
//                         renderHistoryList();
//                     })
//                     .catch(e => console.warn('加载历史失败:', e));
//             }
//         }
//     } catch (e) {
//         console.warn('loadSessionCards 执行失败:', e);
//     }
//     
//     state._sessionCardsLoading = false;
// }

function loadSessionCards() {
    console.log('loadSessionCards 已修复');
    // 只加载一次，避免重复
    if (state._sessionCardsLoaded) return;
    state._sessionCardsLoaded = true;

    try {
        const historyList = document.getElementById('historyList');
        if (!historyList) return;
        // 使用 fetch 加载历史
        if (state.sessionId) {
            fetch(`/api/history/${state.sessionId}`)
                .then(r => r.json())
                .then(data => {
                    state.historyItems = data.history || [];
                    if (state.historyItems.length > 0) {
                        historyList.innerHTML = state.historyItems.map(item =>
                            `<div class="history-item">${item.question || '历史记录'}</div>`
                        ).join('');
                    }
                })
                .catch(e => console.warn('加载历史失败:', e));
        }
    } catch (e) {
        console.warn('loadSessionCards 执行失败:', e);
    }
}

function renderSessionCards() {
    if (typeof window.renderSessionCards === 'function') {
        window.renderSessionCards();
    }
}

function clearHistory() {
    if (typeof window.clearHistory === 'function') {
        window.clearHistory();
    }
}

// ============================================
// 修复 updateScopeDisplay - 避免无限递归
// ============================================

// function updateScopeDisplay() {
//     try {
//         // 直接更新显示，不调用自身
//         const scopeEl = document.getElementById('composerScope');
//         if (scopeEl) {
//             const source = els.sourceFilter ? els.sourceFilter.value : '全部';
//             const tenant = els.tenantInput ? els.tenantInput.value.trim() || 'default' : 'default';
//             const dataset = els.datasetInput ? els.datasetInput.value.trim() || 'default' : 'default';
//             const visibility = els.visibilitySelect ? els.visibilitySelect.value : 'public';
//             const role = els.roleSelect ? els.roleSelect.value : 'public';
//             scopeEl.textContent = `${source}｜${tenant}/${dataset}｜${visibility}`;
//         }
//         
//         // 更新分类激活状态
//         updateCategoryActive();
//     } catch (e) {
//         console.warn('updateScopeDisplay 执行失败:', e);
//     }
// }

function updateScopeDisplay() {
    console.log('updateScopeDisplay 已修复');
    try {
        const scopeEl = document.getElementById('composerScope');
        if (scopeEl) {
            const source = els.sourceFilter ? els.sourceFilter.value : '全部';
            const tenant = els.tenantInput ? els.tenantInput.value.trim() || 'default' : 'default';
            const dataset = els.datasetInput ? els.datasetInput.value.trim() || 'default' : 'default';
            scopeEl.textContent = `${source}｜${tenant}/${dataset}｜public`;
        }
        // 直接调用 updateCategoryActive（但已被禁用）
    } catch (e) {
        console.warn('updateScopeDisplay 执行失败:', e);
    }
}

function updateCategoryActive() {
//     if (typeof window.updateCategoryActive === 'function') {
//         window.updateCategoryActive();
//     }
    // 直接返回，不做任何操作（防止递归）
    console.log('renderSessionCards 已禁用');
    return;
}

function filterHistory() {
    if (typeof window.filterHistory === 'function') {
        window.filterHistory();
    }
}

function autoResizeInput() {
    const input = els.chatInput;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
}

console.log('app.js 加载完成');
