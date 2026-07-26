/**
 * KnowFoundry RAG Console - 聊天和文档生成功能
 * 包含聊天历史、示例问题、文档生成、模板管理
 */

// ============================================
// 聊天功能
// ============================================

// 初始化聊天
function initChat() {
    loadSessionHistory();
    loadSampleQuestions();
}

// 加载会话历史
async function loadSessionHistory() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;
    
    try {
        const response = await fetch('/api/history/' + state.sessionId);
        const data = await response.json();
        state.historyItems = data.history || [];
        renderHistoryList();
    } catch (e) {
        console.error('加载会话历史失败:', e);
    }
}

// 渲染历史列表
function renderHistoryList() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;
    
    if (state.historyItems.length === 0) {
        historyList.innerHTML = '<div style="padding: 12px; color: #999; font-size: 13px; text-align: center;">暂无历史对话</div>';
        return;
    }
    
    historyList.innerHTML = state.historyItems.map(item => `
        <div class="history-item" onclick="loadHistoryItem('${item.id}')">
            <div class="history-question">${escapeHtml(item.question)}</div>
            <div class="history-time">${item.timestamp}</div>
        </div>
    `).join('');
}

// 加载历史项
function loadHistoryItem(id) {
    console.log('加载历史:', id);
}

// 加载示例问题
function loadSampleQuestions() {
    const container = document.getElementById('sampleQuestions');
    if (!container) return;
    
    const samples = [
        { text: '生成软件开发计划', icon: 'file-text' },
        { text: '生成质量保证计划', icon: 'shield-check' },
        { text: '生成配置管理计划', icon: 'settings' },
        { text: '生成需求规格说明', icon: 'file-edit' },
        { text: '生成技术审查报告', icon: 'clipboard-check' },
        { text: '生成测试用例', icon: 'beaker' },
        { text: '生成项目建设方案', icon: 'building-2' }
    ];
    
    container.innerHTML = samples.map(s => `
        <div class="sample-item" onclick="fillSample('${s.text}')">
            <i data-lucide="${s.icon}"></i>
            <span>${s.text}</span>
        </div>
    `).join('');
    
    if (window.lucide) window.lucide.createIcons();
}

// 填充示例问题到输入框
function fillSample(text) {
    const input = document.getElementById('chatInput');
    if (input) {
        input.value = text;
        input.focus();
        input.dispatchEvent(new Event('input'));
    }
}

// ============================================
// 场景名称映射
// ============================================

function getScenarioDisplayName(scenarioId) {
    const names = {
        'enterprise_knowledge': '企业内部知识',
        'engineering_project_qa': '工程项目资料',
        'military_software_438c': '军用软件开发文档',
        'compliance_qa': '合规制度知识',
        'equipment_ops': '设备运维知识',
        'tender_contract_risk': '招投标与合同履约'
    };
    return names[scenarioId] || scenarioId;
}

// ============================================
// 文档生成功能
// ============================================

/**
 * 处理生成文档按钮点击
 * 直接调用 Agent API (HTTP)，不依赖 WebSocket
 */
function handleGenerateDocument() {
    const statusEl = document.getElementById('generateStatus');
    if (!statusEl) return;
    
    // 获取当前选中的场景
    const scenarioId = state.scenarioId || 'enterprise_knowledge';
    const scenarioName = getScenarioDisplayName(scenarioId);
    
    // 获取选中的文档类型
    const docTypeSelect = document.getElementById('docTypeSelect');
    const docType = docTypeSelect ? docTypeSelect.value : '开发计划';
    
    // 获取产品名称
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
    
    // 禁用按钮防止重复点击
    const generateBtn = document.getElementById('generateDocBtn');
    if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.style.opacity = '0.6';
        generateBtn.style.cursor = 'not-allowed';
    }
    
    // 将查询填入输入框（让用户看到）
    const inputEl = document.getElementById('chatInput');
    if (inputEl) {
        inputEl.value = query;
        inputEl.dispatchEvent(new Event('input'));
    }
    
    // 获取 session_id
    const session_id = state.sessionId || 'default';
    
    console.log('📄 生成文档请求:', { query, scenarioId, session_id });
    
    // ===== 直接调用 Agent API (HTTP) =====
    fetch('/api/agent/run', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            query: query,
            scenario_id: scenarioId,
            session_id: session_id
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('📄 文档生成响应:', data);
        
        if (data.status === 'success') {
            // 成功生成
            statusEl.textContent = `✅ ${docType}已生成！`;
            statusEl.style.color = '#16a34a';
            statusEl.style.background = '#dcfce7';
            
            // 在聊天区域显示成功信息
            const chatHistory = document.getElementById('chatHistory');
            if (chatHistory) {
                const div = document.createElement('div');
                div.className = 'message assistant-message success-message';
                div.innerHTML = `
                    <div class="message-content">
                        <p><strong>✅ ${docType} 已成功生成</strong></p>
                        <p style="margin-top: 8px; font-size: 13px; color: #555;">
                            📁 文档路径: <code style="background: #f3f4f6; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${data.doc_path || '未知路径'}</code>
                        </p>
                        ${data.doc_path ? `<p style="margin-top: 4px;"><a href="/${data.doc_path}" target="_blank" style="color: #2563eb; text-decoration: underline;">📂 点击打开文档</a></p>` : ''}
                        <p style="margin-top: 8px; font-size: 12px; color: #999;">文档类型: ${data.doc_type || docType} | 产品: ${data.product_name || productName || '未指定'}</p>
                    </div>
                `;
                chatHistory.appendChild(div);
                chatHistory.scrollTop = chatHistory.scrollHeight;
            }
            
            // 更新侧边栏统计
            if (typeof updateSideStats === 'function') {
                state.lastStreamStatus = `${docType}生成完成`;
                updateSideStats();
            }
            
        } else if (data.status === 'info') {
            // 信息提示（路由到了 RAG 链路）
            statusEl.textContent = `ℹ️ ${data.content || '已路由到 RAG 链路'}`;
            statusEl.style.color = '#f59e0b';
            statusEl.style.background = '#fef3c7';
            
            // 在聊天区域显示提示
            const chatHistory = document.getElementById('chatHistory');
            if (chatHistory) {
                const div = document.createElement('div');
                div.className = 'message assistant-message info-message';
                div.innerHTML = `
                    <div class="message-content">
                        <p><strong>ℹ️ 提示</strong></p>
                        <p>${data.content || '该请求已路由到 RAG 链路，请等待流式响应。'}</p>
                    </div>
                `;
                chatHistory.appendChild(div);
                chatHistory.scrollTop = chatHistory.scrollHeight;
            }
            
        } else {
            // 失败
            const errorMsg = data.error || data.content || '未知错误';
            statusEl.textContent = `❌ 生成失败`;
            statusEl.style.color = '#dc2626';
            statusEl.style.background = '#fecaca';
            
            // 在聊天区域显示错误
            const chatHistory = document.getElementById('chatHistory');
            if (chatHistory) {
                const div = document.createElement('div');
                div.className = 'message assistant-message error-message';
                div.innerHTML = `
                    <div class="message-content">
                        <p><strong>❌ 生成失败</strong></p>
                        <p style="color: #dc2626;">${errorMsg}</p>
                    </div>
                `;
                chatHistory.appendChild(div);
                chatHistory.scrollTop = chatHistory.scrollHeight;
            }
        }
    })
    .catch(error => {
        console.error('❌ 生成文档失败:', error);
        statusEl.textContent = `❌ 网络错误: ${error.message}`;
        statusEl.style.color = '#dc2626';
        statusEl.style.background = '#fecaca';
        
        // 在聊天区域显示错误
        const chatHistory = document.getElementById('chatHistory');
        if (chatHistory) {
            const div = document.createElement('div');
            div.className = 'message assistant-message error-message';
            div.innerHTML = `
                <div class="message-content">
                    <p><strong>❌ 网络错误</strong></p>
                    <p style="color: #dc2626;">${error.message}</p>
                    <p style="font-size: 12px; color: #999; margin-top: 4px;">请检查后端服务是否正常运行</p>
                </div>
            `;
            chatHistory.appendChild(div);
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }
    })
    .finally(() => {
        // 恢复按钮
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.style.opacity = '1';
            generateBtn.style.cursor = 'pointer';
        }
        
        // 5秒后清除状态
        setTimeout(() => {
            if (statusEl.textContent && !statusEl.textContent.includes('✅')) {
                // 只有成功状态保留更长时间
                statusEl.textContent = '';
                statusEl.style.background = '#f3f4f6';
            }
        }, 8000);
    });
}
// ============================================
// 模板管理功能
// ============================================

const templateState = {
    currentTemplate: null,
    templates: []
};

// 加载模板列表
async function loadTemplates() {
    try {
        const response = await fetch('/api/agent/templates');
        const data = await response.json();
        templateState.templates = data.templates || [];
        renderTemplateList();
    } catch (e) {
        console.error('加载模板列表失败:', e);
    }
}

// 渲染模板列表
function renderTemplateList() {
    const container = document.getElementById('templateList');
    if (!container) return;
    
    if (templateState.templates.length === 0) {
        container.innerHTML = '<div style="font-size: 12px; color: #999; text-align: center; padding: 8px;">暂无模板，请上传</div>';
        return;
    }
    
    container.innerHTML = templateState.templates.map(t => {
        const isActive = templateState.currentTemplate === t.filename;
        return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; border-bottom: 1px solid #f3f4f6; ${isActive ? 'background: #dbeafe;' : ''}">
                <span style="font-size: 12px; color: #374151; cursor: pointer;" onclick="selectTemplate('${t.filename}')">
                    ${isActive ? '📌 ' : ''}${escapeHtml(t.filename)}
                </span>
                <span style="font-size: 11px; color: #999;">${(t.size/1024).toFixed(1)}KB</span>
            </div>
        `;
    }).join('');
}

// 选择模板
function selectTemplate(filename) {
    templateState.currentTemplate = filename;
    const nameEl = document.getElementById('currentTemplateName');
    if (nameEl) nameEl.textContent = filename;
    renderTemplateList();
}

// 获取当前选中的模板
function getCurrentTemplate() {
    return templateState.currentTemplate;
}

// ============================================
// DOM 事件绑定
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // 生成文档按钮
    const generateBtn = document.getElementById('generateDocBtn');
    if (generateBtn) {
        generateBtn.addEventListener('click', handleGenerateDocument);
    }
    
    // 上传模板按钮
    const uploadBtn = document.getElementById('uploadTemplateBtn');
    const fileInput = document.getElementById('templateFileInput');
    
    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', () => {
            fileInput.click();
        });
        
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const statusEl = document.getElementById('templateUploadStatus');
            if (!statusEl) return;
            
            statusEl.textContent = '⏳ 上传中...';
            statusEl.style.color = '#2563eb';
            
            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('name', file.name);
                
                const response = await fetch('/api/agent/template/upload', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    statusEl.textContent = '✅ 上传成功！';
                    statusEl.style.color = '#16a34a';
                    await loadTemplates();
                } else {
                    statusEl.textContent = '❌ 上传失败: ' + (result.error || '未知错误');
                    statusEl.style.color = '#dc2626';
                }
            } catch (err) {
                statusEl.textContent = '❌ 上传失败: ' + err.message;
                statusEl.style.color = '#dc2626';
            }
            
            setTimeout(() => {
                statusEl.textContent = '';
            }, 3000);
            
            fileInput.value = '';
        });
    }
    
    // 加载模板列表
    loadTemplates();
    
    // 初始化聊天
    initChat();
});

// ============================================
// 键盘快捷键
// ============================================

document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        const input = document.getElementById('chatInput');
        if (document.activeElement === input) {
            e.preventDefault();
            if (!state.inProgress) {
                if (typeof window.sendMessage === 'function') {
                    window.sendMessage();
                } else {
                    const sendBtn = document.getElementById('sendBtn');
                    if (sendBtn) {
                        sendBtn.click();
                    }
                }
            }
        }
    }
});

// 工具函数：HTML 转义
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

console.log('chat.js 加载完成');
