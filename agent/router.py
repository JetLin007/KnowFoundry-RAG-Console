"""请求路由与任务分发"""
from typing import Dict, Any, Union
from agent.workflows.generate_document import GenerateDocumentWorkflow
from qa_core.application.factory import get_qa_service
from qa_core.api.service_context import QueryServiceContext

class AgentRouter:
    """路由用户请求到对应的工作流或RAG"""

    def __init__(self):
        self.workflows = {
            "generate_document": GenerateDocumentWorkflow()
        }
        self.qa_service = get_qa_service()

    async def route(self, request: str, session_id: str = None) -> Union[Dict, Any]:
        """根据意图路由请求"""
        # 检测是否包含"生成"关键词
        if "生成" in request:
            # 所有生成请求都路由到通用文档生成工作流
            return await self.workflows["generate_document"].run(request, thread_id=session_id)

        # 默认回退到一期 RAG 流式生成器
        context = QueryServiceContext(
            query=request,
            scenario_id="enterprise_knowledge",
            kb_version=None,
            source_filter=None,
            session_id=session_id or "default",
            tenant_id="default",
            dataset_id="default",
            visibility="public",
            user_role="public",
            user_roles=["public"]
        )
        return self.qa_service.stream_query(*context.service_args())
