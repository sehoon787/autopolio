from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging
import os

# Configure logging: enable INFO level for api.* loggers
# uvicorn overrides root logger config, so configure api logger with its own handler
logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(message)s", force=True)

from api.config import get_settings
from api.database import init_db, close_db, cleanup_stale_jobs, AsyncSessionLocal
from api.routers import users, github, templates, pipeline, documents, llm, platforms, lookup, oauth
from api.routers.knowledge import companies, projects, achievements, credentials

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    os.makedirs(settings.data_dir, exist_ok=True)
    os.makedirs(settings.templates_dir, exist_ok=True)
    os.makedirs(settings.result_dir, exist_ok=True)
    await init_db()
    await cleanup_stale_jobs()

    # System templates are now loaded from static files/code at request time.
    # No DB initialization needed - they're always available.
    logging.info("System templates: loaded from static files (no DB init required)")

    yield
    # Shutdown
    await close_db()


app = FastAPI(
    title=settings.app_name,
    description="Portfolio/Resume automation platform with GitHub analysis and LLM-powered summaries",
    version="1.0.0",
    lifespan=lifespan,
)

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
app.include_router(credentials.router, prefix="/api/knowledge/credentials", tags=["Credentials"])
app.include_router(templates.router, prefix="/api/templates", tags=["Templates"])
app.include_router(pipeline.router, prefix="/api/pipeline", tags=["Pipeline"])
app.include_router(documents.router, prefix="/api/documents", tags=["Documents"])
app.include_router(llm.router, prefix="/api/llm", tags=["LLM"])

# Electron-only: register decrypted API keys endpoint
if os.environ.get("AUTOPOLIO_RUNTIME") == "electron":
    from api.routers import llm_keys
    app.include_router(llm_keys.router, prefix="/api/llm", tags=["LLM"])

app.include_router(platforms.router, prefix="/api/platforms", tags=["Platforms"])
app.include_router(lookup.router, prefix="/api", tags=["Lookup"])
app.include_router(oauth.router, prefix="/api/oauth", tags=["OAuth"])


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Log validation errors for debugging."""
    logging.error(f"Validation error for {request.method} {request.url.path}: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()}
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all handler to ensure proper JSON response with CORS headers on 500 errors."""
    logging.error(f"Unhandled exception for {request.method} {request.url.path}: {exc}", exc_info=True)
    origin = request.headers.get("origin", "")
    headers = {}
    if origin:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers=headers,
    )


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
    uvicorn.run(app, host="0.0.0.0", port=settings.api_port, reload=settings.debug)
