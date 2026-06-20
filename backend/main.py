from dotenv import load_dotenv

load_dotenv()
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import analyze

app = FastAPI(
    title="CLINNA AI",
    description="Authenticity & Cost Analysis for Streetwear / Archive Fashion",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # dev mode — restrict to app origins in production
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router, prefix="/api/v1", tags=["analyze"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}
