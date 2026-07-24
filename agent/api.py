"""Agent API 路由 - 暴露工作流给前端和测试工具"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any

from agent.router import AgentRouter

router = APIRouter(prefix="/api/agent", tags=["agent"])
agent_router = AgentRouter()

class WorkflowRequest(BaseModel):
    query: str
    session_id: Optional[str] = None
    scenario_id: Optional[str] = "engineering_project_qa"

class WorkflowResponse(BaseModel):
    status: str
    content: Optional[str] = None
    doc_path: Optional[str] = None
    test_items: Optional[list] = None
    error: Optional[str] = None

@router.post("/run", response_model=WorkflowResponse)
async def run_workflow(request: WorkflowRequest):
    """执行 Agent 工作流（同步版本，用于测试）"""
    try:
        result = await agent_router.route(
            request.query,
            session_id=request.session_id
        )
        # 判断返回类型
        if isinstance(result, dict):
            return WorkflowResponse(
                status="success",
                content=result.get("content", ""),
                doc_path=result.get("doc_path", ""),
                test_items=result.get("test_items", [])
            )
        else:
            # 如果是生成器（RAG 流式），返回提示信息
            return WorkflowResponse(
                status="info",
                content="该请求被路由到 RAG 链路，请使用 WebSocket 获取流式响应"
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
async def agent_health():
    """Agent 模块健康检查"""
    return {
        "status": "ok",
        "workflows": list(agent_router.workflows.keys()),
        "message": "Agent module is ready"
    }
