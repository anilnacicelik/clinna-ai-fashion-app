from dotenv import load_dotenv

load_dotenv()
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from routers import analyze, webhooks, account
from services.rate_limit import limiter

_origins_env = os.getenv("ALLOWED_ORIGINS", "")
if not _origins_env or _origins_env.strip() == "*":
    # No ALLOWED_ORIGINS set — defaults wide open. Mobile apps aren't subject to
    # browser CORS, so this mainly matters if a web client is ever added.
    # Set ALLOWED_ORIGINS in the deployment env to a comma-separated list to lock this down.
    _allowed_origins = ["*"]
else:
    _allowed_origins = [o.strip() for o in _origins_env.split(",") if o.strip()]

app = FastAPI(
    title="CLINNA AI",
    description="Authenticity & Cost Analysis for Streetwear / Archive Fashion",
    version="0.1.0",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router, prefix="/api/v1", tags=["analyze"])
app.include_router(webhooks.router, prefix="/api/v1/webhooks", tags=["webhooks"])
app.include_router(account.router, prefix="/api/v1/account", tags=["account"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}
