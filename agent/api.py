"""Agent API 路由"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import os
import json

from agent.router import AgentRouter
from agent.template_manager import TemplateManager
from agent.workflows.generate_document import GenerateDocumentWorkflow

router = APIRouter(prefix="/api/agent", tags=["agent"])
agent_router = AgentRouter()
template_manager = TemplateManager()

class WorkflowRequest(BaseModel):
    query: str
    session_id: Optional[str] = None
    scenario_id: Optional[str] = "enterprise_knowledge"
    template_id: Optional[str] = None  # 可选：使用指定模板

class WorkflowResponse(BaseModel):
    status: str
    content: Optional[str] = None
    doc_path: Optional[str] = None
    doc_type: Optional[str] = None
    product_name: Optional[str] = None
    style: Optional[str] = None
    emphasis: Optional[str] = None
    error: Optional[str] = None

@router.post("/run", response_model=WorkflowResponse)
async def run_workflow(request: WorkflowRequest):
    """执行 Agent 工作流"""
    try:
        result = await agent_router.route(
            request.query,
            session_id=request.session_id
        )
        
        if isinstance(result, dict):
            # 如果指定了模板，应用模板
            if request.template_id:
                template_path = os.path.join("./templates", request.template_id)
                if os.path.exists(template_path):
                    # 提取变量
                    variables = {
                        "product_name": result.get("product_name", "指定产品"),
                        "doc_type": result.get("doc_type", "文档"),
                        "content": result.get("content", ""),
                        "style": result.get("style", "标准"),
                        "emphasis": result.get("emphasis", "质量"),
                        "date": datetime.now().strftime("%Y-%m-%d")
                    }
                    # 应用模板
                    doc_path = template_manager.apply_template(
                        template_path, 
                        result.get("content", ""), 
                        variables
                    )
                    result["doc_path"] = doc_path
            
            return WorkflowResponse(
                status="success",
                content=result.get("content", ""),
                doc_path=result.get("doc_path", ""),
                doc_type=result.get("doc_type", ""),
                product_name=result.get("product_name", ""),
                style=result.get("style", ""),
                emphasis=result.get("emphasis", "")
            )
        else:
            return WorkflowResponse(
                status="info",
                content="该请求被路由到 RAG 链路，请使用 WebSocket 获取流式响应"
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/template/upload")
async def upload_template(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None)
):
    """上传 Word 模板"""
    try:
        content = await file.read()
        filename = name or file.filename
        result = template_manager.save_template(content, filename)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/templates")
async def list_templates():
    """列出所有可用模板"""
    return {"templates": template_manager.list_templates()}

@router.get("/template/{template_id}")
async def download_template(template_id: str):
    """下载模板"""
    template_path = os.path.join("./templates", template_id)
    if not os.path.exists(template_path):
        raise HTTPException(status_code=404, detail="模板不存在")
    return FileResponse(template_path, filename=os.path.basename(template_path))

@router.delete("/template/{template_id}")
async def delete_template(template_id: str):
    """删除模板"""
    template_path = os.path.join("./templates", template_id)
    if os.path.exists(template_path):
        os.remove(template_path)
        return {"success": True, "message": "模板已删除"}
    raise HTTPException(status_code=404, detail="模板不存在")
