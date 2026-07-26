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
    
    historyList.innerHTML = state.historyItems.map(function(item) {
        return '<div class="history-item" onclick="loadHistoryItem(\'' + item.id + '\')">' +
            '<div class="history-question">' + escapeHtml(item.question) + '</div>' +
            '<div class="history-time">' + item.timestamp + '</div>' +
            '</div>';
    }).join('');
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
    
    container.innerHTML = samples.map(function(s) {
        return '<div class="sample-item" onclick="fillSample(\'' + s.text + '\')">' +
            '<i data-lucide="' + s.icon + '"></i>' +
            '<span>' + s.text + '</span>' +
            '</div>';
    }).join('');
    
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
    var names = {
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
// 生成文档功能
// ============================================

function handleGenerateDocument() {
    console.log('handleGenerateDocument 被调用');
    
    var statusEl = document.getElementById('generateStatus');
    if (!statusEl) return;
    
    var inputEl = document.getElementById('chatInput');
    if (!inputEl) {
        console.error('找不到输入框');
        return;
    }
    
    var query = inputEl.value.trim();
    if (!query) {
        var docTypeSelect = document.getElementById('docTypeSelect');
        var docType = docTypeSelect ? docTypeSelect.value : '开发计划';
        var productInput = document.getElementById('productInput');
        var productName = productInput ? productInput.value.trim() : '';
        query = productName ? '为' + productName + '生成' + docType : '请生成' + docType;
        inputEl.value = query;
        inputEl.dispatchEvent(new Event('input'));
    }
    
    var docTypeSelect = document.getElementById('docTypeSelect');
    var docType = docTypeSelect ? docTypeSelect.value : '开发计划';
    var scenarioId = state.scenarioId || 'enterprise_knowledge';
    
    statusEl.textContent = '⏳ 正在生成' + docType + '...';
    statusEl.style.color = '#2563eb';
    statusEl.style.background = '#dbeafe';
    
    var generateBtn = document.getElementById('generateDocBtn');
    if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.style.opacity = '0.6';
        generateBtn.style.cursor = 'not-allowed';
    }
    
    // 在聊天区域添加用户消息
    var chatHistory = document.getElementById('chatHistory');
    if (chatHistory) {
        var userDiv = document.createElement('div');
        userDiv.className = 'message user-message';
        userDiv.innerHTML = '<div class="message-content">' + escapeHtml(query) + '</div>';
        chatHistory.appendChild(userDiv);
        
        var aiDiv = document.createElement('div');
        aiDiv.className = 'message assistant-message streaming';
        aiDiv.id = 'streaming-' + Date.now();
        aiDiv.innerHTML = '<div class="message-content"><span class="typing-indicator">⏳ 正在生成' + docType + '...</span></div>';
        chatHistory.appendChild(aiDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }
    
    // 调用 API
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
    .then(function(response) {
        if (!response.ok) {
            throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        }
        return response.json();
    })
    .then(function(data) {
        console.log('API 响应:', data);
        
        if (data.status === 'success') {
            statusEl.textContent = '✅ ' + docType + '已生成！';
            statusEl.style.color = '#16a34a';
            statusEl.style.background = '#dcfce7';
            
            var streamingEl = document.querySelector('.assistant-message.streaming');
            if (streamingEl) {
                var content = streamingEl.querySelector('.message-content');
                if (content) {
                    var docContent = data.content || '文档内容为空';
                    var formattedContent = formatMarkdownToHtml(docContent);
                    var encodedContent = encodeURIComponent(docContent);
                    
                    content.innerHTML = '<div class="doc-content-wrapper" style="width: 100%;">' +
                        '<div style="background: #f0fdf4; padding: 10px 14px; border-radius: 6px; margin-bottom: 10px; border-left: 4px solid #16a34a; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">' +
                        '<div><span style="font-weight: 600; color: #166534;">✅ ' + docType + ' 已生成</span>' +
                        '<span style="font-size: 12px; color: #64748b; margin-left: 8px;">📁 ' + (data.doc_path || '') + '</span></div>' +
                        '<div style="display: flex; gap: 6px; flex-wrap: wrap;">' +
                        (data.doc_path ? '<a href="/' + data.doc_path + '" target="_blank" style="font-size: 12px; color: #2563eb; text-decoration: underline; padding: 2px 10px; background: #dbeafe; border-radius: 4px;">📂 打开</a>' : '') +
                        '<button onclick="toggleDocPreview(this)" style="font-size: 12px; padding: 2px 10px; background: #e2e8f0; border: none; border-radius: 4px; cursor: pointer;">👁️ 预览</button>' +
                        '<button onclick="copyDocContent(this, \'' + encodedContent + '\')" style="font-size: 12px; padding: 2px 10px; background: #e2e8f0; border: none; border-radius: 4px; cursor: pointer;">📋 复制</button>' +
                        '</div></div>' +
                        '<div class="doc-body-container" style="position: relative; max-height: 350px; overflow: hidden; border-radius: 4px; border: 1px solid #e2e8f0;">' +
                        '<div class="doc-body" style="padding: 12px; font-size: 14px; line-height: 1.6; color: #1e293b; max-height: 350px; overflow-y: auto; background: #fafafa;">' +
                        formattedContent +
                        '</div>' +
                        '<div class="doc-fade" style="position: absolute; bottom: 0; left: 0; right: 0; height: 40px; background: linear-gradient(transparent, #fafafa); pointer-events: none;"></div>' +
                        '</div>' +
                        '<div style="margin-top: 8px; padding: 4px 10px; background: #f1f5f9; border-radius: 4px; font-size: 11px; color: #64748b; display: flex; justify-content: space-between; flex-wrap: wrap;">' +
                        '<span>类型: ' + (data.doc_type || docType) + '</span>' +
                        '<span>产品: ' + (data.product_name || '未指定') + '</span>' +
                        '<span>' + new Date().toLocaleTimeString() + '</span>' +
                        '</div></div>';
                }
                streamingEl.classList.remove('streaming');
            }
        } else {
            statusEl.textContent = '❌ 生成失败: ' + (data.error || data.content || '未知错误');
            statusEl.style.color = '#dc2626';
            statusEl.style.background = '#fecaca';
        }
    })
    .catch(function(error) {
        console.error('API 调用失败:', error);
        statusEl.textContent = '❌ 网络错误: ' + error.message;
        statusEl.style.color = '#dc2626';
        statusEl.style.background = '#fecaca';
    })
    .finally(function() {
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.style.opacity = '1';
            generateBtn.style.cursor = 'pointer';
        }
        setTimeout(function() {
            if (statusEl.textContent && !statusEl.textContent.includes('✅')) {
                statusEl.textContent = '';
                statusEl.style.background = '#f3f4f6';
            }
        }, 5000);
    });
}

// ============================================
// 文档预览辅助函数
// ============================================

function toggleDocPreview(btn) {
    var container = btn.closest('.doc-content-wrapper');
    if (!container) return;
    
    var bodyContainer = container.querySelector('.doc-body-container');
    var fade = container.querySelector('.doc-fade');
    
    if (!bodyContainer) return;
    
    var isExpanded = bodyContainer.style.maxHeight === 'none';
    
    if (isExpanded) {
        bodyContainer.style.maxHeight = '350px';
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

function copyDocContent(btn, encodedContent) {
    var content = decodeURIComponent(encodedContent);
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(content).then(function() {
            btn.textContent = '✅ 已复制';
            setTimeout(function() { btn.textContent = '📋 复制'; }, 2000);
        }).catch(function() {
            fallbackCopy(content, btn);
        });
    } else {
        fallbackCopy(content, btn);
    }
}

function fallbackCopy(text, btn) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    if (btn) {
        btn.textContent = '✅ 已复制';
        setTimeout(function() { btn.textContent = '📋 复制'; }, 2000);
    }
}

function formatMarkdownToHtml(content) {
    console.log('formatMarkdownToHtml 被调用，内容长度:', content ? content.length : 0);
    
    if (!content) return '<p>文档内容为空</p>';
    
    try {
        var html = '';
        
        if (typeof marked !== 'undefined' && marked.parse) {
            if (marked.setOptions) {
                marked.setOptions({
                    gfm: true,
                    breaks: true,
                    tables: true,
                    headerIds: false,
                    mangle: false
                });
            }
            html = marked.parse(content);
        } else {
            html = simpleMarkdownToHtml(content);
        }
        
        // 给表格添加样式
        html = html.replace(/<table>/g, '<table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; border: 1px solid #d1d5db;">');
        html = html.replace(/<thead>/g, '<thead style="background: #f1f5f9;">');
        html = html.replace(/<th>/g, '<th style="border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; font-weight: 600;">');
        html = html.replace(/<td>/g, '<td style="border: 1px solid #d1d5db; padding: 6px 10px;">');
        
        return html;
    } catch (e) {
        console.error('formatMarkdownToHtml 错误:', e);
        return '<pre style="white-space: pre-wrap; font-size: 13px; color: #333; padding: 8px; background: #f8fafc; border-radius: 4px;">' + escapeHtml(content) + '</pre>';
    }
}

function simpleMarkdownToHtml(content) {
    if (!content) return '';
    
    var html = content;
    
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\s*)+/g, function(match) {
        return '<ul style="margin: 4px 0; padding-left: 20px;">' + match + '</ul>';
    });
    html = html.replace(/^---$/gm, '<hr>');
    html = html.split('\n\n').map(function(para) {
        var trimmed = para.trim();
        if (trimmed && !trimmed.startsWith('<')) {
            return '<p style="margin: 4px 0;">' + trimmed + '</p>';
        }
        return para;
    }).join('\n');
    html = html.replace(/\n/g, '<br>');
    
    return html;
}

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 暴露全局函数
window.handleGenerateDocument = handleGenerateDocument;
window.toggleDocPreview = toggleDocPreview;
window.copyDocContent = copyDocContent;
window.formatMarkdownToHtml = formatMarkdownToHtml;
window.fillSample = fillSample;
window.getScenarioDisplayName = getScenarioDisplayName;

// ============================================
// DOM 事件绑定
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('chat.js DOMContentLoaded');
    
    var generateBtn = document.getElementById('generateDocBtn');
    if (generateBtn) {
        generateBtn.addEventListener('click', handleGenerateDocument);
        console.log('✅ 生成文档按钮已绑定');
    }
    
    var uploadBtn = document.getElementById('uploadTemplateBtn');
    var fileInput = document.getElementById('templateFileInput');
    
    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', function() {
            fileInput.click();
        });
        
        fileInput.addEventListener('change', function(e) {
            var file = e.target.files[0];
            if (!file) return;
            
            var statusEl = document.getElementById('templateUploadStatus');
            statusEl.textContent = '⏳ 上传中...';
            statusEl.style.color = '#2563eb';
            
            var formData = new FormData();
            formData.append('file', file);
            formData.append('name', file.name);
            
            fetch('/api/agent/template/upload', {
                method: 'POST',
                body: formData
            })
            .then(function(response) { return response.json(); })
            .then(function(result) {
                if (result.success) {
                    statusEl.textContent = '✅ 上传成功！';
                    statusEl.style.color = '#16a34a';
                    if (typeof loadTemplates === 'function') loadTemplates();
                } else {
                    statusEl.textContent = '❌ 上传失败: ' + (result.error || '未知错误');
                    statusEl.style.color = '#dc2626';
                }
            })
            .catch(function(err) {
                statusEl.textContent = '❌ 上传失败: ' + err.message;
                statusEl.style.color = '#dc2626';
            });
            
            setTimeout(function() {
                statusEl.textContent = '';
            }, 3000);
            
            fileInput.value = '';
        });
    }
    
    if (typeof loadTemplates === 'function') loadTemplates();
    if (typeof initChat === 'function') initChat();
});

// ============================================
// 键盘快捷键
// ============================================

document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        var input = document.getElementById('chatInput');
        if (document.activeElement === input) {
            e.preventDefault();
            if (!state.inProgress) {
                var sendBtn = document.getElementById('sendBtn');
                if (sendBtn) sendBtn.click();
            }
        }
    }
});

console.log('chat.js 加载完成');
