"""工作流基类，定义通用接口"""
from abc import ABC, abstractmethod
from typing import Dict, Any

class BaseWorkflow(ABC):
    """所有 Agent 工作流的基类"""

    @abstractmethod
    async def run(self, request: str, thread_id: str = "default") -> Dict[str, Any]:
        """执行工作流"""
        pass

    @abstractmethod
    def _build_graph(self):
        """构建 LangGraph 状态图"""
        pass
