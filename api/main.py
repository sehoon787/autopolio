from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os

from api.config import get_settings
from api.database import init_db, close_db
from api.routers import users, github, templates, pipeline, documents
from api.routers.knowledge import companies, projects, achievements

settings = get_settings()


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

# CORS middleware
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
