"""软件测试用例文档 - 文档类型配置"""
from typing import Dict, Any

DOC_TYPE_CONFIG: Dict[str, Any] = {
    "keywords": ["测试用例", "测试计划", "测试"],
    "title": "软件测试用例文档",
    "gjb_template": None,
    "structure": """1. 测试概述
2. 测试项列表
3. 测试用例
   3.1 正常流程测试
   3.2 异常流程测试
   3.3 边界值测试
4. 测试环境配置
5. 测试状态说明"""
}
