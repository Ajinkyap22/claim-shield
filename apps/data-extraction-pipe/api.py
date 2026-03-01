"""
FastAPI server for the clinical NLP → FHIR R4 pipeline.

Endpoints:
  POST /process   — accepts a clinical note, returns a FHIR R4 Bundle
  GET  /health    — liveness check

Start:
  uvicorn api:app --host 0.0.0.0 --port 8000 --reload
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from pipeline import _get_resources, run_pipeline


class ProcessRequest(BaseModel):
    text: str


class ProcessResponse(BaseModel):
    fhir_bundle: dict
    token_usage: list[dict] | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm up: load NER model + ChromaDB once at startup so the first request
    # isn't slow.
    print("[startup] Warming up pipeline resources...")
    _get_resources()
    print("[startup] Ready.")
    yield


app = FastAPI(
    title="Claim Shield — Clinical NLP API",
    description="Converts a raw clinical note into a FHIR R4 Bundle with ICD-10 and CPT codes.",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/process", response_model=ProcessResponse)
def process(req: ProcessRequest):
    """
    Convert a clinical note into a FHIR R4 Bundle.

    - PHI is scrubbed before NER/LLM and reattached afterward.
    - ICD-10 and CPT codes are grounded via NLM API + ChromaDB vector search.
    - If the LLM call fails or is unconfigured, codes are assigned from vector results.
    """
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=422, detail="text must not be empty")
    try:
        fhir_bundle, token_usage = run_pipeline(req.text)
        return ProcessResponse(fhir_bundle=fhir_bundle, token_usage=token_usage or None)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
