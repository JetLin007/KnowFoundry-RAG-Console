from modelscope.hub.snapshot_download import snapshot_download

# 下载 BGE-M3（ModelScope 上的仓库名）
snapshot_download('Xorbits/bge-m3', cache_dir='./models/bge-m3')

# 下载 BGE-Reranker-Large
snapshot_download('Xorbits/bge-reranker-large', cache_dir='./models/bge-reranker-large')
