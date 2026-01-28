from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from contextlib import asynccontextmanager
import logging
import os

# Configure logging: enable INFO level for api.* loggers
# uvicorn overrides root logger config, so configure api logger with its own handler
logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(message)s", force=True)

from api.config import get_settings
from api.database import init_db, close_db
from api.routers import users, github, templates, pipeline, documents, llm
from api.routers.knowledge import companies, projects, achievements

settings = get_settings()


class DebugCORSMiddleware(BaseHTTPMiddleware):
    """Debug middleware to log CORS-related request information."""

    async def dispatch(self, request: Request, call_next):
        origin = request.headers.get("origin", "no-origin")
        method = request.method
        path = str(request.url.path)

        # Log preflight and regular requests
        if settings.debug:
            print(f"[CORS Debug] Origin: {origin}, Method: {method}, Path: {path}")

        response = await call_next(request)

        if settings.debug:
            print(f"[CORS Debug] Response status: {response.status_code}")

        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    os.makedirs(settings.data_dir, exist_ok=True)
    os.makedirs(settings.templates_dir, exist_ok=True)
    os.makedirs(settings.result_dir, exist_ok=True)
    await init_db()
    yield
    # Shutdown
    await close_db()


app = FastAPI(
    title=settings.app_name,
    description="Portfolio/Resume automation platform with GitHub analysis and LLM-powered summaries",
    version="1.0.0",
    lifespan=lifespan,
)

# Debug CORS middleware (must be added before CORSMiddleware)
if settings.debug:
    app.add_middleware(DebugCORSMiddleware)

# CORS middleware - allow all origins in debug mode for easier development
if settings.debug:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Allow all origins in development
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Static files for generated documents
if os.path.exists(settings.result_dir):
    app.mount("/files", StaticFiles(directory=str(settings.result_dir)), name="files")

# Include routers
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(github.router, prefix="/api/github", tags=["GitHub"])
app.include_router(companies.router, prefix="/api/knowledge/companies", tags=["Companies"])
app.include_router(projects.router, prefix="/api/knowledge/projects", tags=["Projects"])
app.include_router(achievements.router, prefix="/api/knowledge/achievements", tags=["Achievements"])
app.include_router(templates.router, prefix="/api/templates", tags=["Templates"])
app.include_router(pipeline.router, prefix="/api/pipeline", tags=["Pipeline"])
app.include_router(documents.router, prefix="/api/documents", tags=["Documents"])
app.include_router(llm.router, prefix="/api/llm", tags=["LLM"])


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": settings.app_name,
        "version": "1.0.0",
        "description": "Portfolio/Resume automation platform",
        "docs_url": "/docs",
        "health": "ok"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=settings.debug)
