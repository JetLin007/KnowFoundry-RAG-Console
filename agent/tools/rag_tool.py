"""将一期 RAG 主链路封装为 Agent 可调用的工具"""
from typing import List, Dict, Any
from pymilvus import Collection, connections
from qa_core.governance.kb_versions import resolve_active_kb_version
from qa_core.retrieval.models import get_embeddings

class RAGTool:
    """一期 RAG 检索工具，供 Agent 工作流调用"""

    def __init__(self, scenario_id: str = "enterprise_knowledge"):
        self.scenario_id = scenario_id
        self.collection_name = self._get_collection_name(scenario_id)
        self._embedding_model = None

    def _get_embedding_model(self):
        """获取 Embedding 模型"""
        if self._embedding_model is None:
            self._embedding_model = get_embeddings()
        return self._embedding_model

    def _get_collection_name(self, scenario_id: str) -> str:
        """根据场景 ID 获取对应的文档集合名称"""
        if scenario_id == "enterprise_knowledge":
            return "enterprise_doc_hybrid_v1"
        elif scenario_id == "engineering_project_qa":
            return "engineering_project_qa_doc_hybrid_v1"
        else:
            return "enterprise_doc_hybrid_v1"

    def retrieve(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """使用 Milvus 直接检索"""
        try:
            model = self._get_embedding_model()
            query_vector = model.embed_query(query)
            
            connections.connect(host='localhost', port='19530')
            collection = Collection(self.collection_name)
            collection.load()
            
            # 只检索 hr_data 来源的文档
            expr = 'source == "hr"'
            
            search_result = collection.search(
                data=[query_vector],
                anns_field='dense',
                param={'metric_type': 'L2', 'params': {'nprobe': 10}},
                limit=top_k,
                output_fields=['text', 'source'],
                expr=expr
            )
            
            hits = []
            for hit in search_result[0]:
                hits.append({
                    'text': hit.entity.get('text', ''),
                    'score': float(hit.score),
                    'source': hit.entity.get('source', '')
                })
            
            return hits
            
        except Exception as e:
            print(f"RAG 检索失败: {e}")
            import traceback
            traceback.print_exc()
            return []
