"""文档类型配置加载器"""
from typing import Dict, Any

# 导入所有文档类型配置
from .development_plan import DOC_TYPE_CONFIG as DEVELOPMENT_PLAN
from .technical_solution import DOC_TYPE_CONFIG as TECHNICAL_SOLUTION
from .quality_assurance import DOC_TYPE_CONFIG as QUALITY_ASSURANCE
from .configuration_management import DOC_TYPE_CONFIG as CONFIGURATION_MANAGEMENT
from .requirements_spec import DOC_TYPE_CONFIG as REQUIREMENTS_SPEC
from .review_report import DOC_TYPE_CONFIG as REVIEW_REPORT
from .test_case import DOC_TYPE_CONFIG as TEST_CASE
from .user_manual import DOC_TYPE_CONFIG as USER_MANUAL
from .acceptance_report import DOC_TYPE_CONFIG as ACCEPTANCE_REPORT
from .project_construction import DOC_TYPE_CONFIG as PROJECT_CONSTRUCTION

# 文档类型映射（doc_type_key -> config）
DOC_TYPE_MAP: Dict[str, Dict[str, Any]] = {
    "开发计划": DEVELOPMENT_PLAN,
    "技术方案": TECHNICAL_SOLUTION,
    "质量保证": QUALITY_ASSURANCE,
    "配置管理": CONFIGURATION_MANAGEMENT,
    "需求规格": REQUIREMENTS_SPEC,
    "审查报告": REVIEW_REPORT,
    "测试用例": TEST_CASE,
    "用户手册": USER_MANUAL,
    "验收报告": ACCEPTANCE_REPORT,
    "项目建设方案": PROJECT_CONSTRUCTION,
}

# GJB 模板映射（用于从模板提取结构）
GJB_TEMPLATE_MAP: Dict[str, Dict[str, Any]] = {}

for doc_type, config in DOC_TYPE_MAP.items():
    template_path = config.get("gjb_template")
    if template_path:
        GJB_TEMPLATE_MAP[doc_type] = {
            "doc_type": doc_type,
            "template_path": template_path,
            "title": config.get("title", ""),
            "gjb_section": "GJB 438C"
        }

def get_doc_config(doc_type: str) -> Dict[str, Any]:
    """获取文档类型配置"""
    return DOC_TYPE_MAP.get(doc_type, DOC_TYPE_MAP.get("质量保证", {}))

def get_gjb_template(doc_type: str) -> Dict[str, Any]:
    """获取 GJB 模板配置"""
    return GJB_TEMPLATE_MAP.get(doc_type, {})

def get_default_structure(doc_type: str) -> str:
    """获取文档类型的默认结构"""
    config = get_doc_config(doc_type)
    return config.get("structure", "")
