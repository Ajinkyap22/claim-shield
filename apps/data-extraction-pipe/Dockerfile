FROM python:3.11-slim

WORKDIR /app

# System deps for torch, chromadb (Rust bindings), and gcc for native extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ make libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

# Install CPU-only torch first so pip does not pull the 5 GB CUDA variant
RUN pip install --no-cache-dir \
    torch>=2.2.0 \
    --index-url https://download.pytorch.org/whl/cpu

# Install the rest of the dependencies (torch already satisfied → skipped)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download the spaCy model required by medSpaCy
RUN python -m spacy download en_core_web_sm

# Pre-download ChromaDB's ONNX embedding model (all-MiniLM-L6-v2) during build
# so the container starts without needing internet access at runtime.
# The model is cached at /root/.cache/chroma/ inside the image.
RUN python -c "from chromadb.utils.embedding_functions import DefaultEmbeddingFunction; DefaultEmbeddingFunction()(['warmup'])"

# Copy application source
COPY . .

# ChromaDB stores its index here; mount a volume over this path to persist data
RUN mkdir -p /app/data/chroma_db

EXPOSE 8002

HEALTHCHECK --interval=15s --timeout=10s --start-period=60s --retries=5 \
    CMD curl -f http://localhost:8002/health || exit 1

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8002"]
