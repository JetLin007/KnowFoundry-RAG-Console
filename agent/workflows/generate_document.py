"""通用文档生成工作流 - 根据用户输入动态生成对应文档"""
from typing import TypedDict, List, Annotated, Dict, Any
import operator
import tempfile
import os
from datetime import datetime
import re

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.prompts import ChatPromptTemplate

from qa_core.llm.client import get_chat_model
from agent.tools.rag_tool import RAGTool
from agent.workflows.base import BaseWorkflow
from agent.template_manager import TemplateManager

from docx import Document as DocxDocument

# 替换原来的 DOC_TYPE_MAP 导入
from agent.workflows.doc_types import (
    DOC_TYPE_MAP,
    GJB_TEMPLATE_MAP,
    get_doc_config,
    get_gjb_template,
    get_default_structure
)
# ============================================
# GJB 438C 模板文档映射和结构提取
# ============================================

def extract_doc_structure_from_template(template_path: str) -> Dict[str, Any]:
    """从 Word 模板中提取文档结构（章节标题和层级）"""
    if not template_path or not os.path.exists(template_path):
        return {"structure": "未找到模板文档，请使用通用结构", "sections": []}
    
    try:
        doc = DocxDocument(template_path)
        sections = []
        current_level = 0
        structure_lines = []
        
        for para in doc.paragraphs:
            text = para.text.strip()
            if not text:
                continue
            
            # 检测标题（通过样式或格式判断）
            # 简单判断：如果文本以数字开头或包含"章"、"节"等
            if para.style.name and 'Heading' in para.style.name:
                level = int(para.style.name.replace('Heading', '').strip()) if para.style.name.replace('Heading', '').strip().isdigit() else 1
                # 限制最大层级
                if level > 5:
                    level = 5
                sections.append({
                    "level": level,
                    "title": text,
                    "content": ""
                })
                # 生成结构描述
                indent = "  " * (level - 1)
                structure_lines.append(f"{indent}{text}")
            elif text.startswith('第') and ('章' in text or '节' in text):
                # 中文章节标题
                level = 1 if '章' in text else 2
                sections.append({
                    "level": level,
                    "title": text,
                    "content": ""
                })
                indent = "  " * (level - 1)
                structure_lines.append(f"{indent}{text}")
            elif text and len(text) < 50 and (text.isupper() or text[0].isdigit()):
                # 可能是标题
                sections.append({
                    "level": 1,
                    "title": text,
                    "content": ""
                })
                structure_lines.append(text)
        
        # 如果提取不到结构，使用默认结构
        if not sections:
            structure_lines = get_default_structure(None)
            sections = []
        
        return {
            "structure": "\n".join(structure_lines),
            "sections": sections,
            "raw_text": "\n".join([p.text for p in doc.paragraphs[:50]])
        }
    except Exception as e:
        print(f"提取模板结构失败: {e}")
        return {"structure": "无法提取模板结构，请使用通用结构", "sections": []}


# ============================================
# 文档状态定义
# ============================================

class DocumentState(TypedDict):
    user_request: str
    doc_type: str
    product_name: str
    style: str
    emphasis: str
    special_requirements: str
    format_settings: Dict[str, Any]
    retrieved_docs: List[Dict[str, Any]]
    doc_content: str
    doc_path: str
    messages: Annotated[List, operator.add]
    error: str


# ============================================
# 默认格式配置
# ============================================

DEFAULT_FORMAT = {
    "font_name": "宋体",
    "font_size": 12,
    "heading1_font": "黑体",
    "heading1_size": 18,
    "heading2_font": "黑体",
    "heading2_size": 16,
    "heading3_font": "黑体",
    "heading3_size": 14,
    "line_spacing": 1.5,
    "margin_top": 2.54,
    "margin_bottom": 2.54,
    "margin_left": 3.17,
    "margin_right": 3.17,
    "alignment": "left",
    "table_style": "Light Grid Accent 1",
    "page_orientation": "portrait"
}

# ============================================
# 风格配置
# ============================================

STYLE_CONFIG = {
    "简略": {
        "max_sections": 3,
        "detail_level": "概述性",
        "prompt_suffix": "生成简洁的概述性文档，每个部分不超过3点，总字数控制在500字左右。"
    },
    "标准": {
        "max_sections": 5,
        "detail_level": "标准",
        "prompt_suffix": "生成标准格式的文档，每个部分覆盖主要内容，总字数控制在1500字左右。"
    },
    "详细": {
        "max_sections": 8,
        "detail_level": "详尽",
        "prompt_suffix": "生成详细的完整文档，每个部分展开论述，包含具体措施和量化指标，总字数控制在3000字以上。"
    }
}

EMPHASIS_CONFIG = {
    "风险": {
        "prompt_suffix": "重点关注风险识别、风险评估、风险应对和风险监控，在每个部分突出风险相关内容。"
    },
    "质量": {
        "prompt_suffix": "重点关注质量标准、质量度量、质量审核和质量改进，在每个部分突出质量相关内容。"
    },
    "进度": {
        "prompt_suffix": "重点关注进度安排、里程碑、资源调配和进度监控，在每个部分突出进度相关内容。"
    },
    "安全": {
        "prompt_suffix": "重点关注安全性设计、安全测试、安全评估和安全保障，在每个部分突出安全相关内容。"
    },
    "成本": {
        "prompt_suffix": "重点关注成本估算、预算控制、成本效益分析和成本优化，在每个部分突出成本相关内容。"
    }
}


# ============================================
# 工作流主类
# ============================================

class GenerateDocumentWorkflow(BaseWorkflow):
    """通用文档生成工作流"""

    def __init__(self, scenario_id: str = "enterprise_knowledge"):
        self.rag_tool = RAGTool(scenario_id=scenario_id)
        self.llm = get_chat_model(streaming=False)
        self.graph = self._build_graph()
        self.memory = MemorySaver()
        self.app = self.graph.compile(checkpointer=self.memory)

    def _extract_doc_type(self, request: str) -> str:
        for doc_type, config in DOC_TYPE_MAP.items():
            for keyword in config["keywords"]:
                if keyword in request:
                    return doc_type
        return "质量保证"

    def _extract_product_name(self, request: str) -> str:
        """从用户输入中提取产品名称（增强版）"""
        # 匹配模式：为[产品名]生成、[产品名]的、[产品名]系统、[产品名]软件等
        patterns = [
            # 1. "为XXX生成YYY" 或 "为XXX的YYY"
            r'[为给]\s*([^\s，,。的]{2,30})\s*[的]?\s*[生制]',
            # 2. "XXX系统"、"XXX软件"、"XXX产品"
            r'([^\s，,。]{2,30})\s*(?:系统|软件|产品|平台)',
            # 3. "XXX生成YYY"（没有"为"字）
            r'^([^\s，,。]{2,30})\s*[生制]',
            # 4. "XXX项目" 
            r'([^\s，,。]{2,30})\s*项目',
            # 5. 引号中的产品名
            r'[""「]([^"」]{2,30})[""」]',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, request)
            if match:
                product = match.group(1).strip()
                # 过滤掉常见非产品词
                stop_words = ['生成', '开发', '测试', '质量', '配置', '需求', '技术', '审查', '用户', '验收']
                if product not in stop_words and len(product) >= 2:
                    return product
        
        # 如果提取不到，尝试从"视频监控系统"这种词组中提取
        # 特殊处理：如果包含"系统"且前面有词
        sys_match = re.search(r'([^\s，,。]{2,20})\s*系统', request)
        if sys_match:
            return sys_match.group(1).strip() + '系统'
        
        # 最后使用默认值
        return "指定产品"

    def _extract_style(self, request: str) -> str:
        if "简略" in request or "简要" in request or "概述" in request:
            return "简略"
        elif "详细" in request or "完整" in request or "详尽" in request:
            return "详细"
        return "标准"

    def _extract_emphasis(self, request: str) -> str:
        if "风险" in request or "风险控制" in request:
            return "风险"
        elif "质量" in request or "质量控制" in request:
            return "质量"
        elif "进度" in request or "时间" in request or "里程碑" in request:
            return "进度"
        elif "安全" in request or "安全性" in request:
            return "安全"
        elif "成本" in request or "预算" in request:
            return "成本"
        return "质量"

    def _extract_special_requirements(self, request: str) -> str:
        special_terms = [
            "符合GJB", "符合标准", "满足规范",
            "强调", "突出", "重点关注",
            "包含", "涵盖", "包括",
            "适用于", "针对"
        ]
        requirements = []
        for term in special_terms:
            if term in request:
                requirements.append(term)
        return "、".join(requirements) if requirements else "无特殊要求"

    def _extract_format_settings(self, request: str) -> Dict[str, Any]:
        """从用户输入中提取格式设置（增强版）"""
        format_settings = DEFAULT_FORMAT.copy()
        
        # 字体映射
        font_map = {
            "宋体": "宋体",
            "黑体": "黑体", 
            "仿宋": "仿宋",
            "楷体": "楷体",
            "微软雅黑": "微软雅黑",
            "Times New Roman": "Times New Roman",
            "Arial": "Arial",
            "Calibri": "Calibri"
        }
        
        # 提取正文字体
        for key, value in font_map.items():
            if key in request:
                format_settings["font_name"] = value
                break
        
        # 提取标题字体（如果有"黑体标题"或"标题黑体"等关键词）
        if "黑体标题" in request or "标题黑体" in request:
            format_settings["heading1_font"] = "黑体"
            format_settings["heading2_font"] = "黑体"
            format_settings["heading3_font"] = "黑体"
        elif "宋体标题" in request or "标题宋体" in request:
            format_settings["heading1_font"] = "宋体"
            format_settings["heading2_font"] = "宋体"
            format_settings["heading3_font"] = "宋体"
        
        # 提取字号
        size_patterns = [
            r'(小?[三四]?号|初号|小初|大?一?二?三?四?五?号)',
            r'(\d{1,2})pt'
        ]
        for pattern in size_patterns:
            match = re.search(pattern, request)
            if match:
                try:
                    size = int(re.search(r'\d+', match.group()).group())
                    if 8 <= size <= 72:
                        format_settings["font_size"] = size
                        format_settings["heading1_size"] = min(size + 6, 28)
                        format_settings["heading2_size"] = min(size + 4, 24)
                        format_settings["heading3_size"] = min(size + 2, 20)
                except:
                    pass
                break
        
        # 提取对齐方式
        if "居中" in request:
            format_settings["alignment"] = "center"
        elif "右对齐" in request:
            format_settings["alignment"] = "right"
        elif "两端对齐" in request:
            format_settings["alignment"] = "justify"
        else:
            format_settings["alignment"] = "left"
        
        # 提取行距
        if "1.5倍" in request or "一倍半" in request:
            format_settings["line_spacing"] = 1.5
        elif "双倍" in request or "2倍" in request:
            format_settings["line_spacing"] = 2
        elif "单倍" in request:
            format_settings["line_spacing"] = 1
        
        # 提取页面方向
        if "横向" in request or "横版" in request:
            format_settings["page_orientation"] = "landscape"
        
        return format_settings

    def _get_doc_config(self, doc_type: str) -> Dict[str, Any]:
        return DOC_TYPE_MAP.get(doc_type, DOC_TYPE_MAP["质量保证"])

    def _build_graph(self):
        graph = StateGraph(DocumentState)
        graph.add_node("extract_info", self.extract_info)
        graph.add_node("retrieve_docs", self.retrieve_docs)
        graph.add_node("generate_document", self.generate_document)
        graph.add_node("save_document", self.save_document)
        graph.set_entry_point("extract_info")
        graph.add_edge("extract_info", "retrieve_docs")
        graph.add_edge("retrieve_docs", "generate_document")
        graph.add_edge("generate_document", "save_document")
        graph.add_edge("save_document", END)
        return graph

    def extract_info(self, state: DocumentState) -> Dict[str, Any]:
        request = state["user_request"]
        return {
            "doc_type": self._extract_doc_type(request),
            "product_name": self._extract_product_name(request),
            "style": self._extract_style(request),
            "emphasis": self._extract_emphasis(request),
            "special_requirements": self._extract_special_requirements(request),
            "format_settings": self._extract_format_settings(request)
        }

    def retrieve_docs(self, state: DocumentState) -> Dict[str, Any]:
        config = self._get_doc_config(state["doc_type"])
        query = f"{config['title']} {state['product_name']} {state['emphasis']}"
        docs = self.rag_tool.retrieve(query, top_k=5)
        mapped_docs = []
        for doc in docs:
            if 'text' in doc:
                mapped_docs.append({'content': doc.get('text', ''), 'score': doc.get('score', 0)})
            else:
                mapped_docs.append(doc)
        return {"retrieved_docs": mapped_docs}

    def _build_custom_prompt(self, state: DocumentState) -> str:
        """根据提取的信息构建自定义提示词，严格遵循 GJB 438C 模板大纲"""
        config = self._get_doc_config(state["doc_type"])
        style_info = STYLE_CONFIG.get(state["style"], STYLE_CONFIG["标准"])
        emphasis_info = EMPHASIS_CONFIG.get(state["emphasis"], EMPHASIS_CONFIG["质量"])
        fmt = state.get("format_settings", DEFAULT_FORMAT)
        product_name = state.get('product_name', '指定产品')
        doc_type = state.get('doc_type', '质量保证')
        
        # ===== 1. 获取文档大纲结构 =====
        structure = config.get("structure", "")
        
        # 如果 DOC_TYPE_MAP 中没有 structure，从 GJB 模板提取
        if not structure:
            template_info = GJB_TEMPLATE_MAP.get(doc_type)
            if template_info:
                template_path = template_info.get("template_path")
                if template_path and os.path.exists(template_path):
                    print(f"📄 从 GJB 438C 模板提取结构: {template_path}")
                    template_data = extract_doc_structure_from_template(template_path)
                    structure = template_data.get("structure")
                    if structure and "未提取" not in structure:
                        print(f"✅ 成功提取模板结构")
        
        # 如果还是没有，使用默认结构
        if not structure:
            structure = get_default_structure(doc_type)
            print(f"⚠️ 使用默认结构: {doc_type}")
        
        # ===== 2. 获取文档标题 =====
        doc_title = config.get('title', doc_type)
        
        # ===== 3. 构建最终提示词（严格遵循模板大纲） =====
        template_info = GJB_TEMPLATE_MAP.get(doc_type)
        gjb_ref = f"GJB 438C-2021《军用软件开发文档通用要求》" if template_info else ""
        
        prompt = f"""你是一位军用软件开发文档专家。请严格按照以下大纲结构，为产品 **{product_name}** 生成一份完整的 {doc_title}。

    ## 重要要求
    1. **严格遵循文档结构**：必须按照下面的文档结构逐章编写，不得增删章节
    2. **章节编号一致**：保持与模板相同的章节编号（1. 1.1 1.2 等）
    3. **内容填充**：每个章节下根据 {product_name} 的具体情况填充实质性内容
    4. **格式规范**：使用标准的文档格式，关键信息用表格呈现
    {f"- 5. **遵循 {gjb_ref} 标准**" if gjb_ref else ""}

    ## 文档结构（必须严格遵循）
    {structure}

    ## 内容要求
    - 每个章节必须包含实质性内容，不能为空
    - 内容应与产品 **{product_name}** 的具体情况相关
    - 专业术语需定义说明
    - 关键信息应使用表格呈现
    - 涉及具体数据的部分，使用合理假设值

    **文档风格要求**：{style_info['prompt_suffix']}

    **侧重要求**：{emphasis_info['prompt_suffix']}

    **特殊要求**：{state['special_requirements']}

    请严格按照以上大纲结构生成文档，确保章节完整、内容专业。
    """
        
        return prompt

    def generate_document(self, state: DocumentState) -> Dict[str, Any]:
        config = self._get_doc_config(state["doc_type"])
        docs = state.get("retrieved_docs", [])
        
        if not docs:
            return {"doc_content": f"未能检索到相关文档，请确保知识库中包含{config['title']}相关内容。"}
        
        docs_text = "\n".join([doc.get('content', '') for doc in docs])
        system_prompt = self._build_custom_prompt(state)
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "参考文档内容：\n{docs}\n\n请生成文档：")
        ])
        
        response = self.llm.invoke(prompt.format_messages(docs=docs_text))
        return {"doc_content": response.content}

    def save_document(self, state: DocumentState) -> Dict[str, Any]:
        """保存文档为 Word（GJB 438C 格式）"""
        config = self._get_doc_config(state["doc_type"])
        fmt = state.get("format_settings", DEFAULT_FORMAT)
        product_name = state.get('product_name', '指定产品')
        doc_title = config.get('title', '文档')
        
        output_dir = "./output/documents"
        os.makedirs(output_dir, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        product = product_name.replace(" ", "_")
        style = state["style"]
        title = doc_title.replace(" ", "_")
        file_path = os.path.join(output_dir, f"{product}_{title}_{style}_{timestamp}.docx")
        
        try:
            from docx import Document
            from docx.shared import Pt, Cm, Inches, RGBColor
            from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING, WD_TAB_ALIGNMENT, WD_TAB_LEADER
            from docx.enum.section import WD_ORIENT
            from docx.oxml.ns import qn
            from docx.oxml import OxmlElement
            import re
            
            content = state["doc_content"]
            doc = Document()
            
            # ==========================================
            # 1. 设置页面格式（A4，符合GJB 438C）
            # ==========================================
            section = doc.sections[0]
            section.top_margin = Cm(2.54)
            section.bottom_margin = Cm(2.54)
            section.left_margin = Cm(3.17)
            section.right_margin = Cm(3.17)
            section.page_width = Cm(21.0)
            section.page_height = Cm(29.7)
            
            # ==========================================
            # 2. 封面页
            # ==========================================
            # 密级（右上角）
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            run = p.add_run("密级：内部")
            run.font.name = "黑体"
            run.font.size = Pt(14)
            run._element.rPr.rFonts.set(qn('w:eastAsia'), "黑体")
            
            # 空行
            doc.add_paragraph()
            
            # 文档类型（居中，大号）
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run(doc_title)
            run.font.name = "黑体"
            run.font.size = Pt(22)
            run.bold = True
            run._element.rPr.rFonts.set(qn('w:eastAsia'), "黑体")
            
            # 产品型号
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run("产品型号-XXXX")
            run.font.name = "宋体"
            run.font.size = Pt(14)
            run._element.rPr.rFonts.set(qn('w:eastAsia'), "宋体")
            
            # 空行
            for _ in range(3):
                doc.add_paragraph()
            
            # 编制单位
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run("XXXXXXXX公司")
            run.font.name = "宋体"
            run.font.size = Pt(16)
            run._element.rPr.rFonts.set(qn('w:eastAsia'), "宋体")
            
            # 日期
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run(f"{datetime.now().strftime('%Y年%m月%d日')}")
            run.font.name = "宋体"
            run.font.size = Pt(14)
            run._element.rPr.rFonts.set(qn('w:eastAsia'), "宋体")
            
            # 分页
            doc.add_page_break()
            
            # ==========================================
            # 3. 签署页
            # ==========================================
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run(doc_title)
            run.font.name = "黑体"
            run.font.size = Pt(20)
            run.bold = True
            run._element.rPr.rFonts.set(qn('w:eastAsia'), "黑体")
            
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run("产品型号-XXXX")
            run.font.name = "宋体"
            run.font.size = Pt(14)
            run._element.rPr.rFonts.set(qn('w:eastAsia'), "宋体")
            
            # 空行
            for _ in range(4):
                doc.add_paragraph()
            
            # 签署栏（左右两列）
            signatures = [
                ("编制：", "日期："),
                ("校对：", "日期："),
                ("审核：", "日期："),
                ("标审：", "日期："),
                ("审定：", "日期："),
                ("批准：", "日期：")
            ]
            
            for signer, date in signatures:
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                run = p.add_run(f"{signer}        {date}")
                run.font.name = "宋体"
                run.font.size = Pt(14)
                run._element.rPr.rFonts.set(qn('w:eastAsia'), "宋体")
            
            # 分页
            doc.add_page_break()
            
            # ==========================================
            # 4. 正文内容
            # ==========================================
            # 设置正文样式
            style = doc.styles['Normal']
            style.font.name = '宋体'
            style.font.size = Pt(12)
            style._element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
            style.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY
            style.paragraph_format.line_spacing = Pt(20)  # 固定行距20磅
            style.paragraph_format.first_line_indent = Cm(0.75)  # 首行缩进2字符
            
            # 解析内容
            lines = content.split('\n')
            in_table = False
            table_data = []
            
            # 定义标题样式
            heading_styles = {
                'h1': {'font': '黑体', 'size': 18, 'indent': 0, 'space_before': 12, 'space_after': 6},
                'h2': {'font': '黑体', 'size': 16, 'indent': 0, 'space_before': 10, 'space_after': 4},
                'h3': {'font': '黑体', 'size': 14, 'indent': 0, 'space_before': 8, 'space_after': 3},
                'h4': {'font': '黑体', 'size': 12, 'indent': 0, 'space_before': 6, 'space_after': 2},
            }
            
            for line in lines:
                line = line.rstrip()
                if not line:
                    continue
                
                # 检测标题
                header_level = None
                if line.startswith('# '):
                    header_level = 'h1'
                    text = line[2:].strip()
                elif line.startswith('## '):
                    header_level = 'h2'
                    text = line[3:].strip()
                elif line.startswith('### '):
                    header_level = 'h3'
                    text = line[4:].strip()
                elif line.startswith('#### '):
                    header_level = 'h4'
                    text = line[5:].strip()
                else:
                    text = line
                
                if header_level:
                    p = doc.add_paragraph()
                    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                    p.paragraph_format.first_line_indent = Cm(0)
                    p.paragraph_format.space_before = Pt(heading_styles[header_level]['space_before'])
                    p.paragraph_format.space_after = Pt(heading_styles[header_level]['space_after'])
                    p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY
                    p.paragraph_format.line_spacing = Pt(20)
                    
                    run = p.add_run(text)
                    run.font.name = heading_styles[header_level]['font']
                    run.font.size = Pt(heading_styles[header_level]['size'])
                    run.bold = True
                    run._element.rPr.rFonts.set(qn('w:eastAsia'), heading_styles[header_level]['font'])
                else:
                    # 普通段落
                    p = doc.add_paragraph(text)
                    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                    p.paragraph_format.first_line_indent = Cm(0.75)
                    p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY
                    p.paragraph_format.line_spacing = Pt(20)
                    
                    for run in p.runs:
                        run.font.name = "宋体"
                        run.font.size = Pt(12)
                        run._element.rPr.rFonts.set(qn('w:eastAsia'), "宋体")
            
            # ==========================================
            # 5. 生成目录（在正文前插入）
            # ==========================================
            # 在正文前插入目录
            # 由于python-docx不支持自动生成目录，我们创建手动目录
            # 从内容中提取标题
            
            # 重新解析内容，提取所有标题用于目录
            toc_entries = []
            for line in content.split('\n'):
                line = line.rstrip()
                if line.startswith('# '):
                    level = 1
                    text = line[2:].strip()
                elif line.startswith('## '):
                    level = 2
                    text = line[3:].strip()
                elif line.startswith('### '):
                    level = 3
                    text = line[4:].strip()
                elif line.startswith('#### '):
                    level = 4
                    text = line[5:].strip()
                else:
                    continue
                
                if text and len(text) < 50:
                    toc_entries.append((level, text))
            
            # 在正文前插入目录页
            # 由于我们已经添加了封面和签署页，现在在正文前插入目录
            # 使用 python-docx 的目录功能（简化版）
            # 注意：实际生成需要更复杂的处理
            
            # 简单目录（手动创建）
            # 由于python-docx不支持自动TOC，我们用段落模拟
            # 在文档开头插入目录标题
            # 实际上，更合适的方式是生成后手动更新目录
            
            # 在分页之前，回到文档开头插入目录
            # 我们简单处理：在正文前添加目录标题和条目
            
            # 由于复杂的目录生成需要更多代码，这里简化处理
            # 实际项目中可以使用 python-docx 的 add_toc 功能或第三方库
            
            doc.save(file_path)
            return {"doc_path": file_path, "format_applied": fmt}
            
        except ImportError:
            md_path = file_path.replace(".docx", ".md")
            with open(md_path, "w", encoding="utf-8") as f:
                f.write(state["doc_content"])
            return {"doc_path": md_path, "warning": "python-docx 未安装，已保存为 Markdown 格式"}
        except Exception as e:
            md_path = file_path.replace(".docx", ".md")
            with open(md_path, "w", encoding="utf-8") as f:
                f.write(state["doc_content"])
            return {"doc_path": md_path, "warning": f"Word 生成失败，已保存为 Markdown: {str(e)}"}

    async def run(self, request: str, thread_id: str = "default") -> Dict[str, Any]:
        config = {"configurable": {"thread_id": thread_id}}
        initial_state = {"user_request": request}
        final_state = await self.app.ainvoke(initial_state, config)

        return {
            "content": final_state.get("doc_content", ""),
            "doc_path": final_state.get("doc_path", ""),
            "doc_type": final_state.get("doc_type", "未知类型"),
            "product_name": final_state.get("product_name", "未知产品"),
            "style": final_state.get("style", "标准"),
            "emphasis": final_state.get("emphasis", "质量"),
            "format_settings": final_state.get("format_settings", DEFAULT_FORMAT)
        }
