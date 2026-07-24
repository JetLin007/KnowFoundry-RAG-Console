async function sendMessage() {
  const query = els.chatInput.value.trim();
  if (!query || state.inProgress) return;
  els.chatInput.value = '';
  autoResizeInput();
  els.chatHistory.querySelector('.welcome-message')?.remove();
  appendMessage('user', query, '你');
  const assistant = appendMessage('assistant', '<div class="typing-row"><span>正在处理</span><span class="typing-dots"><span></span><span></span><span></span></span></div>', '助手', true);
  state.inProgress = true;
  state.cancelled = false;
  updateSendState();

  try {
    const result = await streamAnswer(query, assistant.content);
    upsertSessionCard(state.sessionId, {
      title: query,
      summary: result.answer || '回答完成'
    });
    if (result.answer) {
      assistant.content.appendChild(renderFeedbackActions(query, result.answer, result.sources));
    }
    await loadHistory();
  } catch (error) {
    upsertSessionCard(state.sessionId, {
      title: query,
      summary: '处理失败'
    });
    assistant.content.classList.remove('stream-status');
    assistant.content.innerHTML = renderMarkdown(`抱歉，处理失败：${error.message || error}`);
  } finally {
    state.inProgress = false;
    updateSendState();
    scrollToBottom();
  }
}

function cancelStream() {
  state.cancelled = true;
  if (state.socket && state.socket.readyState === WebSocket.OPEN) {
    state.socket.close();
  }
  state.inProgress = false;
  updateSendState();
}

// ============================================
// 生成文档功能
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    const generateBtn = document.getElementById('generateDocBtn');
    if (generateBtn) {
        generateBtn.addEventListener('click', handleGenerateDocument);
    }
});

function handleGenerateDocument() {
    const statusEl = document.getElementById('generateStatus');
    if (!statusEl) return;

    // 获取当前选中的场景
    const scenarioId = state.scenarioId || 'enterprise_knowledge';
    const scenarioName = getScenarioDisplayName(scenarioId);

    // 获取选中的文档类型
    const docTypeSelect = document.getElementById('docTypeSelect');
    const docType = docTypeSelect ? docTypeSelect.value : '开发计划';

    // 获取产品名称（如果用户输入了产品名）
    const productInput = document.getElementById('productInput');
    let productName = '';
    if (productInput && productInput.value.trim()) {
        productName = productInput.value.trim();
    }

    // 构造查询
    let query = '';
    if (productName) {
        query = `为${productName}生成${docType}`;
    } else {
        query = `请生成${docType}`;
    }

    // 显示状态
    statusEl.textContent = `⏳ 正在生成${docType}...`;
    statusEl.style.color = '#2563eb';
    statusEl.style.background = '#dbeafe';

    // 将查询填入输入框
    const inputEl = document.getElementById('chatInput');
    if (inputEl) {
        inputEl.value = query;
        inputEl.dispatchEvent(new Event('input'));
        inputEl.focus();
    }

    // 延迟发送
    setTimeout(() => {
        if (typeof sendMessage === 'function') {
            sendMessage();
        } else {
            const sendBtn = document.getElementById('sendBtn');
            if (sendBtn) {
                sendBtn.click();
            }
        }
    }, 100);

    // 监听流式结束
    const checkComplete = setInterval(() => {
        if (state.lastStreamStatus === '回答完成' || state.lastStreamStatus === '处理异常') {
            clearInterval(checkComplete);
            if (state.lastStreamStatus === '回答完成') {
                statusEl.textContent = `✅ ${docType}已生成！`;
                statusEl.style.color = '#16a34a';
                statusEl.style.background = '#dcfce7';
            } else {
                statusEl.textContent = '❌ 生成失败，请重试';
                statusEl.style.color = '#dc2626';
                statusEl.style.background = '#fecaca';
            }
            setTimeout(() => {
                statusEl.textContent = '';
                statusEl.style.background = '#f3f4f6';
            }, 5000);
        }
    }, 1000);

    // 30秒超时
    setTimeout(() => {
        clearInterval(checkComplete);
        if (statusEl.textContent === `⏳ 正在生成${docType}...`) {
            statusEl.textContent = '⏰ 生成超时，请重试';
            statusEl.style.color = '#f59e0b';
            statusEl.style.background = '#fef3c7';
        }
    }, 30000);
}

function getScenarioDisplayName(scenarioId) {
    const names = {
        'enterprise_knowledge': '企业内部知识',
        'engineering_project_qa': '工程项目资料',
        'software_development_qa': '软件开发规范',
        'military_software_438c': '军用软件开发文档(GJB 438C)',
        'compliance_qa': '合规制度知识',
        'cross_border_risk': '跨境贸易风控',
        'equipment_ops': '设备运维知识',
        'insurance_claims': '保险理赔审核',
        'saas_support': 'SaaS客服知识',
        'tender_contract_risk': '招投标与合同履约'
    };
    return names[scenarioId] || scenarioId;
}
