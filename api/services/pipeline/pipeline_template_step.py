"""
Pipeline Template Mapping Step - Step 6 of the document generation pipeline.

This module contains the template mapping step extracted from pipeline_steps.py.
"""
import logging
from typing import Dict, Any, TYPE_CHECKING
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)

from api.models.user import User
from api.models.project import Project, ProjectTechnology
from api.models.company import Company
from api.models.template import Template
from api.models.document import GeneratedDocument
from api.models.repo_analysis import RepoAnalysis
from api.schemas.pipeline import PipelineRunRequest

if TYPE_CHECKING:
    from api.services.core import TaskService
    from api.services.document import DocumentService

# Step names constant (imported from pipeline_steps for consistency)
STEP_NAMES = [
    "GitHub Analysis",
    "Code Extraction",
    "Tech Detection",
    "Achievement Detection",
    "LLM Summarization",
    "Template Mapping",
    "Document Generation"
]


async def step_template_mapping(
    db: AsyncSession,
    user_id: int,
    task_service: "TaskService",
    request: PipelineRunRequest,
    user: User,
    summary_results: Dict[str, Any],
    document_service: "DocumentService"
) -> Dict[str, Any]:
    """Step 6: Map data to template fields."""
    await task_service.start_step(request.task_id, 6, STEP_NAMES[5])

    # Get template
    template_result = await db.execute(
        select(Template).where(Template.id == request.template_id)
    )
    template = template_result.scalar_one_or_none()
    if not template:
        raise ValueError("Template not found")

    # Get companies
    companies_result = await db.execute(
        select(Company).where(Company.user_id == user_id)
    )
    companies = companies_result.scalars().all()

    # Filter by company_ids if specified
    if request.company_ids:
        companies = [c for c in companies if c.id in request.company_ids]

    # Get projects with all relations
    projects_result = await db.execute(
        select(Project)
        .where(Project.id.in_(request.project_ids))
        .options(
            selectinload(Project.technologies).selectinload(ProjectTechnology.technology),
            selectinload(Project.achievements)
        )
        .order_by(Project.start_date.desc())
    )
    projects = projects_result.scalars().all()

    # Get repo analyses for key_tasks and detailed_achievements
    from api.models.repo_analysis_edits import RepoAnalysisEdits
    project_key_tasks = {}
    project_achievements_data = {}

    for p in projects:
        analysis_result = await db.execute(
            select(RepoAnalysis).where(RepoAnalysis.project_id == p.id)
        )
        analysis = analysis_result.scalar_one_or_none()
        if analysis:
            # Check for user edits first
            edits_result = await db.execute(
                select(RepoAnalysisEdits).where(RepoAnalysisEdits.repo_analysis_id == analysis.id)
            )
            edits = edits_result.scalar_one_or_none()

            # Get key_tasks (with edits priority)
            if edits and edits.key_tasks_modified and edits.key_tasks:
                project_key_tasks[p.id] = edits.key_tasks
            elif analysis.key_tasks:
                project_key_tasks[p.id] = analysis.key_tasks
            else:
                project_key_tasks[p.id] = []

            # Get detailed_achievements and convert to list formats
            effective_detailed_achievements = None
            if edits and edits.detailed_achievements_modified and edits.detailed_achievements:
                effective_detailed_achievements = edits.detailed_achievements
            elif analysis.detailed_achievements:
                effective_detailed_achievements = analysis.detailed_achievements

            # Convert dict format to list format for DocxGenerator
            summary_list = []
            detailed_list = []
            if effective_detailed_achievements and isinstance(effective_detailed_achievements, dict):
                for category, items in effective_detailed_achievements.items():
                    if isinstance(items, list):
                        for item in items:
                            if isinstance(item, dict):
                                title = item.get("title", "")
                                description = item.get("description", "")
                                if title:
                                    summary_list.append({
                                        "category": category,
                                        "title": title,
                                    })
                                    detailed_list.append({
                                        "category": category,
                                        "title": title,
                                        "description": description,
                                    })

            project_achievements_data[p.id] = {
                "summary_list": summary_list,
                "detailed_list": detailed_list,
            }
        else:
            project_key_tasks[p.id] = []
            project_achievements_data[p.id] = {"summary_list": [], "detailed_list": []}

    # Prepare template data with all user profile fields
    template_data = document_service.prepare_template_data(
        user_data={
            "name": user.display_name or user.name,
            "email": user.profile_email or user.email,
            "github_username": user.github_username,
            "phone": user.phone or "",
            "address": user.address or "",
            "birthdate": str(user.birthdate) if user.birthdate else "",
        },
        companies=[
            {
                "id": c.id,
                "name": c.name,
                "position": c.position,
                "department": c.department,
                "start_date": c.start_date,
                "end_date": c.end_date,
                "description": c.description,
                "location": c.location
            }
            for c in companies
        ],
        projects=[
            {
                "company_id": p.company_id,
                "name": p.name,
                "short_description": p.short_description,
                "description": p.description,
                "ai_summary": p.ai_summary,
                "start_date": p.start_date,
                "end_date": p.end_date,
                "role": p.role,
                "team_size": p.team_size,
                "contribution_percent": p.contribution_percent,
                "technologies": [pt.technology.name for pt in p.technologies],
                "key_tasks": project_key_tasks.get(p.id, []),
                "achievements": [
                    {
                        "metric_name": a.metric_name,
                        "metric_value": a.metric_value,
                        "description": a.description
                    }
                    for a in p.achievements
                ] if request.include_achievements else [],
                "achievements_summary_list": project_achievements_data.get(p.id, {}).get("summary_list", []) if request.include_achievements else [],
                "achievements_detailed_list": project_achievements_data.get(p.id, {}).get("detailed_list", []) if request.include_achievements else [],
                "links": p.links or {}
            }
            for p in projects
        ]
    )

    results = {
        "template_id": template.id,
        "template_name": template.name,
        "template_content": template.template_content,
        "template_platform": template.platform,
        "data": template_data,
        "output_format": request.output_format
    }

    await task_service.complete_step(request.task_id, 6, {"mapped": True})
    return results


async def step_document_generation(
    db: AsyncSession,
    user_id: int,
    task_service: "TaskService",
    request: PipelineRunRequest,
    mapping_results: Dict[str, Any],
    document_service: "DocumentService"
) -> GeneratedDocument:
    """Step 7: Generate the final document."""
    await task_service.start_step(request.task_id, 7, STEP_NAMES[6])

    # Generate document name
    document_name = request.document_name or f"Resume_{datetime.now().strftime('%Y%m%d')}"

    # Generate document
    file_path, file_size = await document_service.generate_document(
        template_content=mapping_results["template_content"],
        data=mapping_results["data"],
        output_format=request.output_format,
        document_name=document_name,
        template_platform=mapping_results.get("template_platform")
    )

    # Save document record
    document = GeneratedDocument(
        user_id=user_id,
        template_id=mapping_results["template_id"],
        document_name=document_name,
        file_path=file_path,
        file_format=request.output_format,
        file_size=file_size,
        included_projects=request.project_ids,
        included_companies=request.company_ids,
        generation_settings={
            "llm_provider": request.llm_provider,
            "include_achievements": request.include_achievements,
            "include_tech_stack": request.include_tech_stack,
            "auto_analyze": request.auto_analyze
        },
        status="completed"
    )
    db.add(document)
    await db.flush()
    await db.refresh(document)

    await task_service.complete_step(request.task_id, 7, {
        "document_id": document.id,
        "file_path": file_path
    })

    return document
