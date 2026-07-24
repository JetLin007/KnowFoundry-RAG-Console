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

class DocumentState(TypedDict):
    user_request: str
    doc_type: str
    product_name: str
    style: str          # 文档风格：简略/标准/详细
    emphasis: str       # 侧重点：风险/质量/进度/安全
    special_requirements: str  # 特殊要求
    format_settings: Dict[str, Any]  # 新增：格式设置
    retrieved_docs: List[Dict[str, Any]]
    doc_content: str
    doc_path: str
    messages: Annotated[List, operator.add]
    error: str

# 默认格式配置
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
    "alignment": "left",  # left, center, justify
    "table_style": "Light Grid Accent 1",
    "page_orientation": "portrait"  # portrait, landscape
}

# 文档类型映射
DOC_TYPE_MAP = {
    "质量保证": {
        "keywords": ["质量保证计划", "质量计划", "SQAP", "质量保证"],
        "title": "软件质量保证计划",
    },
    "开发计划": {
        "keywords": ["开发计划", "软件开发计划", "项目计划"],
        "title": "软件开发计划",
    },
    "配置管理": {
        "keywords": ["配置管理计划", "配置计划", "配置管理"],
        "title": "软件配置管理计划",
    },
    "需求规格": {
        "keywords": ["需求规格说明", "需求规格", "SRS", "需求", "功能需求"],
        "title": "软件需求规格说明",
    },
    "技术方案": {
        "keywords": ["总体技术方案", "技术方案", "架构设计"],
        "title": "软件总体技术方案",
    },
    "审查报告": {
        "keywords": ["审查报告", "技术审查", "评审报告"],
        "title": "技术审查报告",
    },
    "测试用例": {
        "keywords": ["测试用例", "测试计划", "测试"],
        "title": "软件测试用例文档",
    },
    "验收报告": {
        "keywords": ["验收报告", "验收", "交付验收"],
        "title": "软件验收报告",
    },
    "用户手册": {
        "keywords": ["用户手册", "使用手册", "操作手册"],
        "title": "软件用户手册",
    }
}

# 风格配置
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

# 侧重点配置
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

class GenerateDocumentWorkflow(BaseWorkflow):
    """通用文档生成工作流"""

    def __init__(self, scenario_id: str = "enterprise_knowledge"):
        self.rag_tool = RAGTool(scenario_id=scenario_id)
        self.llm = get_chat_model(streaming=False)
        self.graph = self._build_graph()
        self.memory = MemorySaver()
        self.app = self.graph.compile(checkpointer=self.memory)

    def _extract_doc_type(self, request: str) -> str:
        """从用户输入中提取文档类型"""
        for doc_type, config in DOC_TYPE_MAP.items():
            for keyword in config["keywords"]:
                if keyword in request:
                    return doc_type
        return "质量保证"

    def _extract_product_name(self, request: str) -> str:
        """从用户输入中提取产品名称"""
        patterns = [
            r'[为给]?\s*([^\s，,。的]{2,20})\s*产品',
            r'产品\s*([^\s，,。]{2,20})',
            r'项目\s*([^\s，,。]{2,20})',
            r'[为给]\s*([^\s，,。]{2,20})\s*[生制]',
        ]
        for pattern in patterns:
            match = re.search(pattern, request)
            if match:
                return match.group(1).strip()
        return "指定产品"

    def _extract_style(self, request: str) -> str:
        """从用户输入中提取文档风格"""
        if "简略" in request or "简要" in request or "概述" in request:
            return "简略"
        elif "详细" in request or "完整" in request or "详尽" in request:
            return "详细"
        return "标准"

    def _extract_emphasis(self, request: str) -> str:
        """从用户输入中提取侧重点"""
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
        """从用户输入中提取特殊要求"""
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
        """从用户输入中提取格式设置"""
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
        
        # 提取字体
        for key, value in font_map.items():
            if key in request:
                format_settings["font_name"] = value
                break
        
        # 提取字号（常见字号）
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
        """获取文档配置"""
        return DOC_TYPE_MAP.get(doc_type, DOC_TYPE_MAP["质量保证"])

    def _build_graph(self):
        """构建 LangGraph 状态图"""
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
        """提取文档类型、产品名称、风格、侧重点、特殊要求和格式设置"""
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
        """检索相关文档"""
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
        """根据提取的信息构建自定义提示词"""
        config = self._get_doc_config(state["doc_type"])
        style_info = STYLE_CONFIG.get(state["style"], STYLE_CONFIG["标准"])
        emphasis_info = EMPHASIS_CONFIG.get(state["emphasis"], EMPHASIS_CONFIG["质量"])
        
        # 基础文档结构
        base_structures = {
            "质量保证": """1. 文档概述（编写目的、适用范围、参考文档）
2. 质量目标
3. 质量保证活动（评审、审核、测试）
4. 质量标准
5. 质量度量
6. 质量审核
7. 质量记录
8. 风险与问题管理""",
            "开发计划": """1. 项目概述
2. 软件开发过程
3. 项目进度安排
4. 资源配置
5. 风险管理
6. 质量保证措施
7. 配置管理要求""",
            "配置管理": """1. 配置管理组织
2. 配置标识
3. 配置控制
4. 配置状态记录
5. 配置审计
6. 软件发布管理""",
            "需求规格": """1. 引言
2. 总体描述
3. 具体需求（功能需求、性能需求、接口需求、可靠性需求、安全性需求）
4. 需求可追踪性
5. 附录""",
            "技术方案": """1. 概述
2. 软件需求概述
3. 系统设计
4. 软件体系结构设计
5. 软件接口设计
6. 数据库设计
7. 安全性设计
8. 可靠性设计""",
            "审查报告": """1. 审查概述
2. 审查依据
3. 审查项目及结果
4. 发现的问题及建议
5. 审查结论
6. 后续行动计划""",
            "测试用例": """1. 测试概述
2. 测试项列表
3. 测试用例（正常流程、异常流程、边界值）
4. 测试环境配置
5. 测试状态说明""",
            "验收报告": """1. 验收概述
2. 验收依据
3. 验收项目及结果
4. 问题及处理
5. 验收结论
6. 交付物清单""",
            "用户手册": """1. 软件概述
2. 安装与配置
3. 功能操作说明
4. 常见问题处理
5. 技术支持信息"""
        }
        
        structure = base_structures.get(state["doc_type"], base_structures["质量保证"])
        fmt = state.get("format_settings", DEFAULT_FORMAT)
        
        prompt = f"""你是一位军用软件开发文档专家。根据提取的文档内容，为产品 **{state['product_name']}** 生成一份**{state['style']}风格**的{config['title']}。

**文档风格要求**：{style_info['prompt_suffix']}

**侧重要求**：{emphasis_info['prompt_suffix']}

**特殊要求**：{state['special_requirements']}

**文档结构**：
{structure}

**格式要求**：
- 正文字体：{fmt.get('font_name', '宋体')}，字号：{fmt.get('font_size', 12)}pt
- 标题字体：{fmt.get('heading1_font', '黑体')}
- 行距：{fmt.get('line_spacing', 1.5)}倍
- 对齐方式：{fmt.get('alignment', '左对齐')}

请确保文档内容专业、完整，符合GJB 438C标准要求。
"""
        return prompt

    def generate_document(self, state: DocumentState) -> Dict[str, Any]:
        """生成文档"""
        config = self._get_doc_config(state["doc_type"])
        docs = state.get("retrieved_docs", [])
        
        if not docs:
            return {"doc_content": f"未能检索到相关文档，请确保知识库中包含{config['title']}相关内容。"}
        
        docs_text = "\n".join([doc.get('content', '') for doc in docs])
        
        # 构建自定义提示词
        system_prompt = self._build_custom_prompt(state)
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "参考文档内容：\n{docs}\n\n请生成文档：")
        ])
        
        response = self.llm.invoke(prompt.format_messages(
            docs=docs_text
        ))
        return {"doc_content": response.content}

    def save_document(self, state: DocumentState) -> Dict[str, Any]:
        """保存文档为 Word（应用用户指定的格式，支持表格）"""
        config = self._get_doc_config(state["doc_type"])
        fmt = state.get("format_settings", DEFAULT_FORMAT)
        
        output_dir = "./output/documents"
        os.makedirs(output_dir, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        product = state["product_name"].replace(" ", "_")
        style = state["style"]
        title = config["title"].replace(" ", "_")
        file_path = os.path.join(output_dir, f"{product}_{title}_{style}_{timestamp}.docx")
        
        try:
            from docx import Document
            from docx.shared import Pt, Cm, Inches, RGBColor
            from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
            from docx.enum.section import WD_ORIENT
            from docx.oxml.ns import qn
            from docx.oxml import OxmlElement
            
            content = state["doc_content"]
            doc = Document()
            
            # ===== 设置页面边距 =====
            section = doc.sections[0]
            section.top_margin = Cm(fmt.get("margin_top", 2.54))
            section.bottom_margin = Cm(fmt.get("margin_bottom", 2.54))
            section.left_margin = Cm(fmt.get("margin_left", 3.17))
            section.right_margin = Cm(fmt.get("margin_right", 3.17))
            
            # ===== 设置页面方向 =====
            if fmt.get("page_orientation") == "landscape":
                section.orientation = WD_ORIENT.LANDSCAPE
                section.page_width = Cm(29.7)
                section.page_height = Cm(21.0)
            
            # ===== 添加标题 =====
            title_para = doc.add_heading(f"{state['product_name']} {config['title']}", 0)
            title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = title_para.runs[0] if title_para.runs else title_para.add_run()
            run.font.name = fmt.get("heading1_font", "黑体")
            run.font.size = Pt(fmt.get("heading1_size", 18))
            run._element.rPr.rFonts.set(qn('w:eastAsia'), fmt.get("heading1_font", "黑体"))
            
            # ===== 添加文档信息 =====
            info_para = doc.add_paragraph()
            info_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
            info_run = info_para.add_run(f"文档风格：{state['style']} | 侧重点：{state['emphasis']}")
            info_run.font.name = fmt.get("font_name", "宋体")
            info_run.font.size = Pt(fmt.get("font_size", 12))
            
            info_para2 = doc.add_paragraph()
            info_para2.alignment = WD_ALIGN_PARAGRAPH.CENTER
            info_run2 = info_para2.add_run(f"生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            info_run2.font.name = fmt.get("font_name", "宋体")
            info_run2.font.size = Pt(fmt.get("font_size", 10))
            
            doc.add_paragraph()
            
            # ===== 解析内容（支持表格） =====
            lines = content.split("\n")
            i = 0
            table_data = []
            in_table = False
            table_headers = None
            
            def apply_cell_style(cell, text, font_name, font_size):
                """应用单元格样式"""
                cell.text = text
                for para in cell.paragraphs:
                    for run in para.runs:
                        run.font.name = font_name
                        run.font.size = Pt(font_size)
                        run._element.rPr.rFonts.set(qn('w:eastAsia'), font_name)
                    para.alignment = WD_ALIGN_PARAGRAPH.LEFT
            
            def apply_paragraph_style(p, line, fmt):
                """应用段落样式"""
                for run in p.runs:
                    run.font.name = fmt.get("font_name", "宋体")
                    run.font.size = Pt(fmt.get("font_size", 12))
                    run._element.rPr.rFonts.set(qn('w:eastAsia'), fmt.get("font_name", "宋体"))
                
                align_map = {
                    "left": WD_ALIGN_PARAGRAPH.LEFT,
                    "center": WD_ALIGN_PARAGRAPH.CENTER,
                    "right": WD_ALIGN_PARAGRAPH.RIGHT,
                    "justify": WD_ALIGN_PARAGRAPH.JUSTIFY
                }
                p.alignment = align_map.get(fmt.get("alignment", "left"), WD_ALIGN_PARAGRAPH.LEFT)
                p.paragraph_format.line_spacing = fmt.get("line_spacing", 1.5)
            
            while i < len(lines):
                line = lines[i]
                
                # ===== 检测表格开始 =====
                if line.startswith("|") and not in_table:
                    # 进入表格模式
                    in_table = True
                    table_data = []
                    # 收集表头
                    headers = [c.strip() for c in line.split("|") if c.strip()]
                    table_data.append(headers)
                    i += 1
                    continue
                
                # ===== 表格行 =====
                if in_table and line.startswith("|"):
                    # 跳过分隔行（包含 ---）
                    if "---" in line:
                        i += 1
                        continue
                    cells = [c.strip() for c in line.split("|") if c.strip()]
                    if cells:
                        table_data.append(cells)
                    i += 1
                    continue
                
                # ===== 表格结束 =====
                if in_table and (not line.startswith("|") or i == len(lines) - 1):
                    in_table = False
                    # 渲染表格
                    if table_data and len(table_data) > 0:
                        headers = table_data[0] if table_data else []
                        rows = table_data[1:] if len(table_data) > 1 else []
                        
                        # 创建表格
                        num_cols = len(headers) if headers else max([len(row) for row in rows]) if rows else 1
                        table = doc.add_table(rows=1 + len(rows), cols=num_cols)
                        table.style = fmt.get("table_style", "Light Grid Accent 1")
                        
                        # 填充表头（第一行）
                        for j, header in enumerate(headers):
                            if j < len(table.rows[0].cells):
                                apply_cell_style(
                                    table.rows[0].cells[j], 
                                    header, 
                                    fmt.get("heading2_font", "黑体"), 
                                    fmt.get("font_size", 12)
                                )
                                # 表头加粗
                                for para in table.rows[0].cells[j].paragraphs:
                                    for run in para.runs:
                                        run.bold = True
                        
                        # 填充数据行
                        for row_idx, row_data in enumerate(rows):
                            if row_idx + 1 < len(table.rows):
                                for col_idx, cell_text in enumerate(row_data):
                                    if col_idx < len(table.rows[row_idx + 1].cells):
                                        apply_cell_style(
                                            table.rows[row_idx + 1].cells[col_idx],
                                            cell_text,
                                            fmt.get("font_name", "宋体"),
                                            fmt.get("font_size", 11)
                                        )
                        
                        # 设置表格宽度
                        for col in range(num_cols):
                            table.rows[0].cells[col].width = Cm(12.0 / num_cols)
                        
                        doc.add_paragraph()  # 表格后添加空行
                    continue
                
                # ===== 标题处理 =====
                if line.startswith("# "):
                    p = doc.add_heading(line[2:], 1)
                    for run in p.runs:
                        run.font.name = fmt.get("heading1_font", "黑体")
                        run.font.size = Pt(fmt.get("heading1_size", 18))
                        run._element.rPr.rFonts.set(qn('w:eastAsia'), fmt.get("heading1_font", "黑体"))
                    i += 1
                    continue
                
                if line.startswith("## "):
                    p = doc.add_heading(line[3:], 2)
                    for run in p.runs:
                        run.font.name = fmt.get("heading2_font", "黑体")
                        run.font.size = Pt(fmt.get("heading2_size", 16))
                        run._element.rPr.rFonts.set(qn('w:eastAsia'), fmt.get("heading2_font", "黑体"))
                    i += 1
                    continue
                
                if line.startswith("### "):
                    p = doc.add_heading(line[4:], 3)
                    for run in p.runs:
                        run.font.name = fmt.get("heading3_font", "黑体")
                        run.font.size = Pt(fmt.get("heading3_size", 14))
                        run._element.rPr.rFonts.set(qn('w:eastAsia'), fmt.get("heading3_font", "黑体"))
                    i += 1
                    continue
                
                # ===== 列表项 =====
                if line.startswith("- "):
                    p = doc.add_paragraph(line[2:], style='List Bullet')
                    apply_paragraph_style(p, line, fmt)
                    i += 1
                    continue
                
                # ===== 普通段落 =====
                if line.strip():
                    p = doc.add_paragraph(line.strip())
                    apply_paragraph_style(p, line, fmt)
                else:
                    # 空行
                    doc.add_paragraph()
                
                i += 1
            
            # ===== 保存文档 =====
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
        """运行工作流"""
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
