from huggingface_hub import snapshot_download

# 下载 BGE-M3 模型到 models/bge-m3
snapshot_download(
    repo_id="BAAI/bge-m3",
    local_dir="./models/bge-m3",
    local_dir_use_symlinks=False
)

# 下载 BGE-Reranker-Large 模型到 models/bge-reranker-large
snapshot_download(
    repo_id="BAAI/bge-reranker-large",
    local_dir="./models/bge-reranker-large",
    local_dir_use_symlinks=False
)
