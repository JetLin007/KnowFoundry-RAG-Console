/**
 * KnowFoundry RAG Console - API 调用和 WebSocket 管理
 */

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function streamAnswer(query, contentElement) {
  if (state.socket && state.socket.readyState === WebSocket.OPEN) {
    state.socket.close();
  }

  return new Promise((resolve, reject) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = window.ADMIN_API_TOKEN || 'admin-token-123';
    state.socket = new WebSocket(`${protocol}//${window.location.host}${API_BASE_URL}/api/stream?token=${token}`);
    
    let answer = '';
    let sources = [];
    let completed = false;
    let settled = false;
    let socketError = false;

    const finish = result => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    setWebSocketHealth('working', '检测中');

    state.socket.onopen = () => {
      setWebSocketHealth('ok', '正常');
      state.lastStreamStatus = '已连接，正在提交问题';
      updateSideStats();
      setConnectionState('working', '生成中');
      state.socket.send(JSON.stringify({
        query,
        source_filter: els.sourceFilter.value,
        session_id: state.sessionId,
        scenario_id: state.scenarioId,
        tenant_id: els.tenantInput.value.trim() || 'default',
        dataset_id: els.datasetInput.value.trim() || 'default',
        visibility: els.visibilitySelect.value || 'public',
        user_role: els.roleSelect.value || 'public'
      }));
    };

    state.socket.onmessage = event => {
      const data = JSON.parse(event.data);
      if (data.trace_id) {
        state.lastTraceId = data.trace_id;
      }
      if (data.type === 'start') {
        state.kbVersion = data.kb_version || state.kbVersion;
        state.lastStreamStatus = '请求已接收';
        updateSideStats();
      }
      if (data.type === 'status') {
        state.lastStreamStatus = data.message || '正在处理';
        updateSideStats();
        if (!answer) {
          contentElement.classList.add('stream-status');
          contentElement.textContent = data.message || '正在处理...';
        }
      } else if (data.type === 'token') {
        answer += data.token || '';
        contentElement.classList.remove('stream-status');
        contentElement.innerHTML = renderMarkdown(answer);
      } else if (data.type === 'end') {
        completed = true;
        sources = data.sources || [];
        state.lastHitType = data.hit_type || '-';
        state.lastSourceCount = sources.length;
        state.lastTraceId = data.trace_id || state.lastTraceId;
        state.lastStreamStatus = '回答完成';
        state.lastDiagnostics = buildDiagnosticsSnapshot(data, sources);
        state.lastClassification = state.lastDiagnostics.classification;
        renderClassificationResult(state.lastClassification);
        if (sources.length) {
          contentElement.appendChild(renderSources(sources));
        }
        contentElement.appendChild(renderAnswerDiagnostics(state.lastDiagnostics));
        setWebSocketHealth('ok', '正常');
        updateSideStats();
        setConnectionState('ready', '就绪');
        state.socket.close();
        finish({ answer, sources });
      } else if (data.type === 'error') {
        completed = true;
        socketError = true;
        setWebSocketHealth('error', '异常');
        state.lastStreamStatus = '处理异常';
        updateSideStats();
        setConnectionState('error', '异常');
        reject(new Error(data.error || '流式响应失败'));
      }
      scrollToBottom();
    };

    state.socket.onerror = () => {
      socketError = true;
      setWebSocketHealth('error', '异常');
      state.lastStreamStatus = 'WebSocket 连接失败';
      updateSideStats();
      setConnectionState('error', '异常');
      reject(new Error('WebSocket 连接失败'));
    };

    state.socket.onclose = () => {
      if (!completed) {
        if (!socketError) {
          setConnectionState('ready', '就绪');
        }
        if (state.cancelled) {
          state.lastStreamStatus = '已停止生成';
          setWebSocketHealth('pending', '已停止');
          updateSideStats();
          contentElement.appendChild(document.createTextNode('\n\n[已停止生成]'));
        }
        finish({ answer, sources });
      }
    };
  });
}

// ============================================
// WebSocket 自动连接（修复版）
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
            console.log('自动连接 WebSocket...');
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const token = window.ADMIN_API_TOKEN || 'admin-token-123';
            state.socket = new WebSocket(`${protocol}//${window.location.host}/api/stream?token=${token}`);

            state.socket.onopen = function() {
                console.log('✅ WebSocket 自动连接成功');
                const el = document.getElementById('websocketHealth');
                if (el) { el.textContent = '正常'; el.className = 'status-ok'; }
                
                // ===== 修复：添加 onmessage 消息处理 =====
                state.socket.onmessage = function(event) {
                    console.log('📩 收到消息:', event.data);
                    try {
                        const data = JSON.parse(event.data);
                        console.log('解析后的数据:', data);
                        
                        if (data.type === 'start') {
                            console.log('✅ 开始生成');
                            // 在聊天区域创建占位
                            const chatHistory = document.getElementById('chatHistory');
                            if (chatHistory) {
                                // 检查最后一个消息是否是用户消息，如果不是则创建新的
                                const lastChild = chatHistory.lastElementChild;
                                if (!lastChild || !lastChild.classList.contains('assistant-message')) {
                                    const div = document.createElement('div');
                                    div.className = 'message assistant-message';
                                    div.innerHTML = '<div class="message-content">⏳ 正在生成...</div>';
                                    chatHistory.appendChild(div);
                                    chatHistory.scrollTop = chatHistory.scrollHeight;
                                }
                            }
                        } else if (data.type === 'token') {
                            console.log('收到 token:', data.token);
                            const chatHistory = document.getElementById('chatHistory');
                            if (chatHistory) {
                                // 查找最后一个 assistant 消息
                                const messages = chatHistory.querySelectorAll('.assistant-message');
                                let lastMsg = messages[messages.length - 1];
                                if (!lastMsg) {
                                    // 如果没有 assistant 消息，创建一个
                                    const div = document.createElement('div');
                                    div.className = 'message assistant-message';
                                    div.innerHTML = '<div class="message-content"></div>';
                                    chatHistory.appendChild(div);
                                    lastMsg = div;
                                }
                                const content = lastMsg.querySelector('.message-content');
                                if (content) {
                                    if (content.textContent === '⏳ 正在生成...') {
                                        content.textContent = data.token || '';
                                    } else {
                                        content.textContent += data.token || '';
                                    }
                                }
                                chatHistory.scrollTop = chatHistory.scrollHeight;
                            }
                        } else if (data.type === 'end') {
                            console.log('✅ 回答完成');
                            state.lastStreamStatus = '回答完成';
                            state.inProgress = false;
                            if (typeof updateSideStats === 'function') updateSideStats();
                            if (typeof setConnectionState === 'function') setConnectionState('ready', '就绪');
                            // 更新 WebSocket 健康状态
                            const el = document.getElementById('websocketHealth');
                            if (el) { el.textContent = '正常'; el.className = 'status-ok'; }
                        } else if (data.type === 'error') {
                            console.error('❌ 错误:', data.error);
                            state.lastStreamStatus = '处理异常';
                            state.inProgress = false;
                            const el = document.getElementById('websocketHealth');
                            if (el) { el.textContent = '异常'; el.className = 'status-error'; }
                        }
                    } catch (e) {
                        console.error('解析消息失败:', e);
                    }
                };
            };
            
            state.socket.onerror = function() {
                console.error('❌ WebSocket 自动连接失败');
                const el = document.getElementById('websocketHealth');
                if (el) { el.textContent = '异常'; el.className = 'status-error'; }
            };
            
            state.socket.onclose = function() {
                console.log('WebSocket 连接关闭');
                const el = document.getElementById('websocketHealth');
                if (el) { el.textContent = '待检测'; el.className = 'status-pending'; }
            };
        }
    }, 500);
});

// ============================================
// WebSocket 健康状态函数
// ============================================

function setWebSocketHealth(type, text) {
    const el = document.getElementById('websocketHealth');
    if (!el) return;
    el.textContent = text;
    el.className = 'status-' + type;
}

function setConnectionState(type, text) {
    const pill = document.getElementById('connectionPill');
    if (!pill) return;
    pill.className = `pill ${type}`;
    const span = pill.querySelector('span:last-child');
    if (span) span.textContent = text;
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

function scrollToBottom() {
    const container = document.getElementById('chatHistory');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

function renderMarkdown(text) {
    if (typeof marked !== 'undefined') {
        return marked.parse(text || '');
    }
    return text || '';
}

function renderSources(sources) {
    if (!sources || sources.length === 0) return '';
    const html = sources.map(s => 
        `<div class="source-item">${s.citation || s.content || '来源'}</div>`
    ).join('');
    return `<div class="sources-container"><h4>📚 引用来源</h4>${html}</div>`;
}

function renderClassificationResult(classification) {
    const el = document.getElementById('classificationResult');
    if (!el) return;
    if (!classification) {
        el.innerHTML = '<div><span>可能分类</span><strong class="classification-badge is-waiting">等待分类</strong></div><ol></ol><p>分类结果会随最近一次回答更新</p>';
        return;
    }
    const candidates = classification.candidates || [];
    const top = candidates[0] || {};
    el.innerHTML = `
        <div><span>可能分类</span><strong class="classification-badge">${top.label || '未知'}</strong></div>
        <ol>${candidates.map(c => `<li>${c.label || c.source}: ${(c.score * 100).toFixed(0)}%</li>`).join('')}</ol>
        <p>分类结果随最近一次回答更新</p>
    `;
}

function renderAnswerDiagnostics(diagnostics) {
    if (!diagnostics) return '';
    return `<div class="diagnostics-container" style="font-size:12px;color:#999;margin-top:8px;padding:8px;background:#f5f5f5;border-radius:4px;">
        <details><summary>🔍 诊断信息</summary>
        <pre style="font-size:11px;white-space:pre-wrap;word-break:break-all;">${JSON.stringify(diagnostics, null, 2)}</pre>
        </details>
    </div>`;
}

function buildDiagnosticsSnapshot(data, sources) {
    return {
        hit_type: data.hit_type || '-',
        source_count: sources ? sources.length : 0,
        retrieval: data.retrieval || {},
        intent: data.intent || {},
        stage_timings_ms: data.stage_timings_ms || {},
        total_elapsed_ms: data.total_elapsed_ms || 0
    };
}

console.log('api.js 加载完成（修复版）');
