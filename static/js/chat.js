// ============================================
// 聊天功能
// ============================================

// 初始化聊天
function initChat() {
  // 加载会话历史
  loadSessionHistory();
  // 加载示例问题
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
      <div class="history-question">${item.question}</div>
      <div class="history-time">${item.timestamp}</div>
    </div>
  `).join('');
}

// 加载历史项
function loadHistoryItem(id) {
  // 实现加载历史消息
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
    { text: '生成测试用例', icon: 'beaker' }
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
// 生成文档功能
// ============================================

// 模板管理状态
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
          ${isActive ? '📌 ' : ''}${t.filename}
        </span>
        <span style="font-size: 11px; color: #999;">${(t.size/1024).toFixed(1)}KB</span>
      </div>
    `;
  }).join('');
}

// 选择模板
function selectTemplate(filename) {
  templateState.currentTemplate = filename;
  document.getElementById('currentTemplateName').textContent = filename;
  renderTemplateList();
}

// 获取当前选中的模板
function getCurrentTemplate() {
  return templateState.currentTemplate;
}

// 场景名称映射
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

// 生成文档
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
  // Enter 发送，Shift+Enter 换行
  if (e.key === 'Enter' && !e.shiftKey) {
    const input = document.getElementById('chatInput');
    if (document.activeElement === input) {
      e.preventDefault();
      const sendBtn = document.getElementById('sendBtn');
      if (sendBtn) {
        sendBtn.click();
      }
    }
  }
});

console.log('chat.js 加载完成');
