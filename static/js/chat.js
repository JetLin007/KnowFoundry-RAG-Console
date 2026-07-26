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
 * 直接使用输入框中的完整查询内容（包含格式要求）
 * 生成完成后保留预览功能
 */
function handleGenerateDocument() {
    const statusEl = document.getElementById('generateStatus');
    if (!statusEl) return;
    
    // ===== 直接从输入框获取完整查询 =====
    const inputEl = document.getElementById('chatInput');
    if (!inputEl) {
        console.error('找不到输入框');
        return;
    }
    
    let query = inputEl.value.trim();
    if (!query) {
        // 如果输入框为空，使用下拉框和产品名构造查询
        const docTypeSelect = document.getElementById('docTypeSelect');
        const docType = docTypeSelect ? docTypeSelect.value : '开发计划';
        const productInput = document.getElementById('productInput');
        const productName = productInput ? productInput.value.trim() : '';
        
        if (productName) {
            query = `为${productName}生成${docType}`;
        } else {
            query = `请生成${docType}`;
        }
        inputEl.value = query;
        inputEl.dispatchEvent(new Event('input'));
    }
    
    // 提取文档类型用于显示
    const docTypeSelect = document.getElementById('docTypeSelect');
    const docType = docTypeSelect ? docTypeSelect.value : '开发计划';
    
    // 获取当前选中的场景
    const scenarioId = state.scenarioId || 'enterprise_knowledge';
    
    // 显示状态
    statusEl.textContent = `⏳ 正在生成${docType}...`;
    statusEl.style.color = '#2563eb';
    statusEl.style.background = '#dbeafe';
    
    // 禁用按钮
    const generateBtn = document.getElementById('generateDocBtn');
    if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.style.opacity = '0.6';
        generateBtn.style.cursor = 'not-allowed';
    }
    
    // ===== 1. 在聊天区域添加用户消息 =====
    const chatHistory = document.getElementById('chatHistory');
    if (chatHistory) {
        const userDiv = document.createElement('div');
        userDiv.className = 'message user-message';
        userDiv.innerHTML = `<div class="message-content">${escapeHtml(query)}</div>`;
        chatHistory.appendChild(userDiv);
        
        // 添加 AI 占位消息
        const aiDiv = document.createElement('div');
        aiDiv.className = 'message assistant-message streaming';
        aiDiv.id = 'streaming-' + Date.now();
        aiDiv.innerHTML = `<div class="message-content"><span class="typing-indicator">⏳ 正在生成${docType}...</span></div>`;
        chatHistory.appendChild(aiDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }
    
    // ===== 2. 通过 WebSocket 发送查询（流式输出） =====
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(JSON.stringify({
            query: query,
            source_filter: els.sourceFilter ? els.sourceFilter.value : '',
            session_id: state.sessionId || 'default',
            scenario_id: scenarioId,
            tenant_id: els.tenantInput ? els.tenantInput.value.trim() || 'default' : 'default',
            dataset_id: els.datasetInput ? els.datasetInput.value.trim() || 'default' : 'default',
            visibility: els.visibilitySelect ? els.visibilitySelect.value : 'public',
            user_role: els.roleSelect ? els.roleSelect.value : 'public'
        }));
        console.log('📄 文档生成请求已通过 WebSocket 发送:', query);
    } else {
        console.warn('⚠️ WebSocket 未连接，无法流式输出');
    }
    
    // ===== 3. 同时调用 HTTP API 生成文档 =====
    fetch('/api/agent/run', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            query: query,
            scenario_id: scenarioId,
            session_id: state.sessionId || 'default'
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
            statusEl.textContent = `✅ ${docType}已生成！`;
            statusEl.style.color = '#16a34a';
            statusEl.style.background = '#dcfce7';
            
            // ===== 显示文档内容（保留预览功能） =====
            const streamingEl = document.querySelector('.assistant-message.streaming');
            if (streamingEl) {
                const content = streamingEl.querySelector('.message-content');
                if (content) {
                    let docContent = data.content || '文档内容为空';
                    let formattedContent = formatMarkdownToHtml(docContent);
                    
                    // 对内容进行编码以便传递给复制函数
                    const encodedContent = encodeURIComponent(docContent);
                    
                    content.innerHTML = `
                        <div class="doc-content-wrapper" style="width: 100%;">
                            <!-- 文档头部信息 -->
                            <div style="background: #f0fdf4; padding: 12px 16px; border-radius: 8px; margin-bottom: 12px; border-left: 4px solid #16a34a; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                                <div>
                                    <p style="margin: 0; font-weight: 600; color: #166534; font-size: 15px;">✅ ${docType} 已成功生成</p>
                                    <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;">
                                        📁 文档路径: <code style="background: #e2e8f0; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${data.doc_path || '未知路径'}</code>
                                    </p>
                                </div>
                                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                                    ${data.doc_path ? `<a href="/${data.doc_path}" target="_blank" style="color: #2563eb; text-decoration: underline; font-size: 13px; padding: 4px 12px; background: #dbeafe; border-radius: 4px;">📂 打开文档</a>` : ''}
                                    <button onclick="toggleDocPreview(this)" style="padding: 4px 12px; background: #e2e8f0; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; color: #1e293b;">👁️ 预览</button>
                                    <button onclick="copyDocContent(this, '${encodedContent}')" style="padding: 4px 12px; background: #e2e8f0; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; color: #1e293b;">📋 复制</button>
                                </div>
                            </div>
                            
                            <!-- 文档正文（可折叠预览） -->
                            <div class="doc-body-container" style="position: relative; max-height: 400px; overflow: hidden; border-radius: 6px; border: 1px solid #e2e8f0;">
                                <div class="doc-body" style="padding: 16px; font-size: 14px; line-height: 1.8; color: #1e293b; max-height: 400px; overflow-y: auto; background: #fafafa;">
                                    ${formattedContent}
                                </div>
                                <div class="doc-fade" style="position: absolute; bottom: 0; left: 0; right: 0; height: 60px; background: linear-gradient(transparent, #fafafa); pointer-events: none;"></div>
                            </div>
                            
                            <!-- 文档底部信息 -->
                            <div style="margin-top: 12px; padding: 8px 12px; background: #f1f5f9; border-radius: 6px; font-size: 12px; color: #64748b; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                                <span>📋 文档类型: ${data.doc_type || docType} | 产品: ${data.product_name || '未指定'}</span>
                                <span>风格: ${data.style || '标准'} | 生成时间: ${new Date().toLocaleTimeString()}</span>
                            </div>
                        </div>
                    `;
                }
                streamingEl.classList.remove('streaming');
            }
            
            if (typeof updateSideStats === 'function') {
                state.lastStreamStatus = `${docType}生成完成`;
                updateSideStats();
            }
            
        } else if (data.status === 'info') {
            statusEl.textContent = `ℹ️ ${data.content || '已路由到 RAG 链路'}`;
            statusEl.style.color = '#f59e0b';
            statusEl.style.background = '#fef3c7';
            
            const streamingEl = document.querySelector('.assistant-message.streaming');
            if (streamingEl) {
                const content = streamingEl.querySelector('.message-content');
                if (content) {
                    content.innerHTML = `
                        <div style="padding: 8px;">
                            <p><strong>ℹ️ 提示</strong></p>
                            <p>${data.content || '该请求已路由到 RAG 链路，请等待流式响应。'}</p>
                        </div>
                    `;
                }
                streamingEl.classList.remove('streaming');
            }
            
        } else {
            const errorMsg = data.error || data.content || '未知错误';
            statusEl.textContent = `❌ 生成失败`;
            statusEl.style.color = '#dc2626';
            statusEl.style.background = '#fecaca';
            
            const streamingEl = document.querySelector('.assistant-message.streaming');
            if (streamingEl) {
                const content = streamingEl.querySelector('.message-content');
                if (content) {
                    content.innerHTML = `
                        <div style="color: #dc2626; padding: 8px;">
                            <p><strong>❌ 生成失败</strong></p>
                            <p>${errorMsg}</p>
                        </div>
                    `;
                }
                streamingEl.classList.remove('streaming');
            }
        }
    })
    .catch(error => {
        console.error('❌ 生成文档失败:', error);
        statusEl.textContent = `❌ 网络错误: ${error.message}`;
        statusEl.style.color = '#dc2626';
        statusEl.style.background = '#fecaca';
        
        const streamingEl = document.querySelector('.assistant-message.streaming');
        if (streamingEl) {
            const content = streamingEl.querySelector('.message-content');
            if (content) {
                content.innerHTML = `
                    <div style="color: #dc2626; padding: 8px;">
                        <p><strong>❌ 网络错误</strong></p>
                        <p>${error.message}</p>
                        <p style="font-size: 12px; color: #999; margin-top: 4px;">请检查后端服务是否正常运行</p>
                    </div>
                `;
            }
            streamingEl.classList.remove('streaming');
        }
    })
    .finally(() => {
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.style.opacity = '1';
            generateBtn.style.cursor = 'pointer';
        }
        
        setTimeout(() => {
            if (statusEl.textContent && !statusEl.textContent.includes('✅')) {
                statusEl.textContent = '';
                statusEl.style.background = '#f3f4f6';
            }
        }, 8000);
    });
}

/**
 * 将 Markdown 格式转换为 HTML（用于文档显示）
 */
function formatMarkdownToHtml(content) {
    if (!content) return '';
    
    let html = content;
    
    // 1. 处理标题 (h1, h2, h3, h4)
    html = html.replace(/^#### (.*$)/gm, '<h4 style="font-size: 16px; font-weight: 600; color: #1e293b; margin: 12px 0 4px 0;">$1</h4>');
    html = html.replace(/^### (.*$)/gm, '<h3 style="font-size: 18px; font-weight: 600; color: #1e293b; margin: 16px 0 6px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">$1</h3>');
    html = html.replace(/^## (.*$)/gm, '<h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 20px 0 8px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">$1</h2>');
    html = html.replace(/^# (.*$)/gm, '<h1 style="font-size: 24px; font-weight: 700; color: #0f172a; margin: 24px 0 10px 0; border-bottom: 3px solid #2563eb; padding-bottom: 8px;">$1</h1>');
    
    // 2. 处理表格
    // 先收集表格行
    const tableLines = [];
    let inTable = false;
    const lines = html.split('\n');
    let processedLines = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith('|')) {
            if (!inTable) {
                inTable = true;
                tableLines.length = 0;
            }
            tableLines.push(line.trim());
        } else {
            if (inTable) {
                // 结束表格，渲染
                if (tableLines.length > 0) {
                    // 检查是否有分隔行（包含 ---）
                    const hasSeparator = tableLines.some(l => l.includes('---'));
                    let headers = [];
                    let rows = [];
                    
                    if (hasSeparator) {
                        // 第一行是表头
                        const headerLine = tableLines[0];
                        headers = headerLine.split('|').filter(c => c.trim() && !c.includes('---')).map(c => c.trim());
                        // 从第三行开始是数据
                        for (let j = 2; j < tableLines.length; j++) {
                            const cells = tableLines[j].split('|').filter(c => c.trim());
                            if (cells.length > 0) {
                                rows.push(cells.map(c => c.trim()));
                            }
                        }
                    } else {
                        // 所有行都是数据
                        for (let j = 0; j < tableLines.length; j++) {
                            const cells = tableLines[j].split('|').filter(c => c.trim());
                            if (cells.length > 0) {
                                if (j === 0) {
                                    headers = cells.map(c => c.trim());
                                } else {
                                    rows.push(cells.map(c => c.trim()));
                                }
                            }
                        }
                    }
                    
                    // 生成表格 HTML
                    let tableHtml = '<table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px;">';
                    if (headers.length > 0) {
                        tableHtml += '<thead><tr>';
                        headers.forEach(h => {
                            tableHtml += `<th style="border: 1px solid #d1d5db; padding: 6px 10px; background: #f1f5f9; text-align: left; font-weight: 600;">${h}</th>`;
                        });
                        tableHtml += '</tr></thead>';
                    }
                    if (rows.length > 0) {
                        tableHtml += '<tbody>';
                        rows.forEach(row => {
                            tableHtml += '<tr>';
                            row.forEach(cell => {
                                tableHtml += `<td style="border: 1px solid #d1d5db; padding: 6px 10px;">${cell}</td>`;
                            });
                            tableHtml += '</tr>';
                        });
                        tableHtml += '</tbody>';
                    }
                    tableHtml += '</table>';
                    processedLines.push(tableHtml);
                }
                inTable = false;
                tableLines.length = 0;
            }
            if (line.trim()) {
                processedLines.push(line);
            }
        }
    }
    if (inTable && tableLines.length > 0) {
        // 处理最后的表格
        const hasSeparator = tableLines.some(l => l.includes('---'));
        let headers = [];
        let rows = [];
        if (hasSeparator) {
            const headerLine = tableLines[0];
            headers = headerLine.split('|').filter(c => c.trim() && !c.includes('---')).map(c => c.trim());
            for (let j = 2; j < tableLines.length; j++) {
                const cells = tableLines[j].split('|').filter(c => c.trim());
                if (cells.length > 0) {
                    rows.push(cells.map(c => c.trim()));
                }
            }
        } else {
            for (let j = 0; j < tableLines.length; j++) {
                const cells = tableLines[j].split('|').filter(c => c.trim());
                if (cells.length > 0) {
                    if (j === 0) {
                        headers = cells.map(c => c.trim());
                    } else {
                        rows.push(cells.map(c => c.trim()));
                    }
                }
            }
        }
        let tableHtml = '<table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px;">';
        if (headers.length > 0) {
            tableHtml += '<thead><tr>';
            headers.forEach(h => {
                tableHtml += `<th style="border: 1px solid #d1d5db; padding: 6px 10px; background: #f1f5f9; text-align: left; font-weight: 600;">${h}</th>`;
            });
            tableHtml += '</tr></thead>';
        }
        if (rows.length > 0) {
            tableHtml += '<tbody>';
            rows.forEach(row => {
                tableHtml += '<tr>';
                row.forEach(cell => {
                    tableHtml += `<td style="border: 1px solid #d1d5db; padding: 6px 10px;">${cell}</td>`;
                });
                tableHtml += '</tr>';
            });
            tableHtml += '</tbody>';
        }
        tableHtml += '</table>';
        processedLines.push(tableHtml);
    }
    
    html = processedLines.join('\n');
    
    // 3. 处理粗体
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    
    // 4. 处理代码块
    html = html.replace(/```([\s\S]*?)```/g, '<pre style="background: #f1f5f9; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px;"><code>$1</code></pre>');
    
    // 5. 处理行内代码
    html = html.replace(/`([^`]+)`/g, '<code style="background: #f1f5f9; padding: 2px 6px; border-radius: 3px; font-size: 13px;">$1</code>');
    
    // 6. 处理列表
    html = html.replace(/^- (.*$)/gm, '<li style="margin: 2px 0;">$1</li>');
    html = html.replace(/^• (.*$)/gm, '<li style="margin: 2px 0;">$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul style="margin: 6px 0; padding-left: 20px;">$1</ul>');
    
    // 7. 处理分隔线
    html = html.replace(/^---$/gm, '<hr style="border: 1px solid #e2e8f0; margin: 16px 0;">');
    
    // 8. 处理段落
    html = html.split('\n\n').map(para => {
        if (para.trim() && !para.trim().startsWith('<')) {
            return `<p style="margin: 4px 0;">${para.trim()}</p>`;
        }
        return para;
    }).join('\n');
    
    return html;
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

// ============================================
// 文档预览辅助函数
// ============================================

/**
 * 切换文档预览展开/收起
 */
function toggleDocPreview(btn) {
    const container = btn.closest('.doc-content-wrapper');
    if (!container) return;

    const bodyContainer = container.querySelector('.doc-body-container');
    const fade = container.querySelector('.doc-fade');

    if (!bodyContainer) return;

    const isExpanded = bodyContainer.style.maxHeight === 'none';

    if (isExpanded) {
        bodyContainer.style.maxHeight = '400px';
        bodyContainer.style.overflow = 'hidden';
        if (fade) fade.style.display = 'block';
        btn.textContent = '👁️ 预览';
    } else {
        bodyContainer.style.maxHeight = 'none';
        bodyContainer.style.overflow = 'visible';
        if (fade) fade.style.display = 'none';
        btn.textContent = '📄 收起';
    }
}

/**
 * 复制文档内容
 */
function copyDocContent(btn, encodedContent) {
    const content = decodeURIComponent(encodedContent);

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(content).then(() => {
            btn.textContent = '✅ 已复制';
            setTimeout(() => { btn.textContent = '📋 复制'; }, 2000);
        }).catch(() => fallbackCopy(content, btn));
    } else {
        fallbackCopy(content, btn);
    }
}

function fallbackCopy(text, btn) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    if (btn) {
        btn.textContent = '✅ 已复制';
        setTimeout(() => { btn.textContent = '📋 复制'; }, 2000);
    }
}


/**
 * 渲染表格
 */
function renderTable(tableLines) {
    const hasSeparator = tableLines.some(l => l.includes('---'));
    let headers = [];
    let rows = [];

    if (hasSeparator) {
        const headerLine = tableLines[0];
        headers = headerLine.split('|').filter(c => c.trim() && !c.includes('---')).map(c => c.trim());
        for (let j = 2; j < tableLines.length; j++) {
            const cells = tableLines[j].split('|').filter(c => c.trim());
            if (cells.length > 0) {
                rows.push(cells.map(c => c.trim()));
            }
        }
    } else {
        for (let j = 0; j < tableLines.length; j++) {
            const cells = tableLines[j].split('|').filter(c => c.trim());
            if (cells.length > 0) {
                if (j === 0) {
                    headers = cells.map(c => c.trim());
                } else {
                    rows.push(cells.map(c => c.trim()));
                }
            }
        }
    }

    let tableHtml = '<div style="overflow-x: auto; margin: 12px 0;">';
    tableHtml += '<table style="width: 100%; border-collapse: collapse; font-size: 13px; border: 1px solid #d1d5db;">';

    if (headers.length > 0) {
        tableHtml += '<thead>';
        tableHtml += '<tr>';
        headers.forEach(h => {
            tableHtml += `<th style="border: 1px solid #d1d5db; padding: 6px 10px; background: #f1f5f9; text-align: left; font-weight: 600;">${h}</th>`;
        });
        tableHtml += '</tr>';
        tableHtml += '</thead>';
    }

    if (rows.length > 0) {
        tableHtml += '<tbody>';
        rows.forEach(row => {
            tableHtml += '<tr>';
            row.forEach(cell => {
                tableHtml += `<td style="border: 1px solid #d1d5db; padding: 6px 10px;">${cell}</td>`;
            });
            tableHtml += '</tr>';
        });
        tableHtml += '</tbody>';
    }

    tableHtml += '</table>';
    tableHtml += '</div>';
    return tableHtml;
}
