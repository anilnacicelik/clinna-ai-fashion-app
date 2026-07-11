from dotenv import load_dotenv

load_dotenv()
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import analyze

_origins_env = os.getenv("ALLOWED_ORIGINS", "")
if not _origins_env or _origins_env.strip() == "*":
    _allowed_origins = ["*"]
else:
    _allowed_origins = [o.strip() for o in _origins_env.split(",") if o.strip()]

app = FastAPI(
    title="CLINNA AI",
    description="Authenticity & Cost Analysis for Streetwear / Archive Fashion",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router, prefix="/api/v1", tags=["analyze"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}
