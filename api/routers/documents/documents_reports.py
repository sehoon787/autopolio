"""Report generation endpoints for documents."""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Literal

from api.database import get_db
from api.services.report import ReportService, ReportProjectService

router = APIRouter()


@router.get("/projects")
async def generate_projects_report(
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate PROJECTS.md style report.
    Lists all projects with details like period, company, team size, role, etc.
    """
    report_service = ReportService(db)
    try:
        content = await report_service.generate_projects_md(user_id)
        return {
            "report_type": "projects_md",
            "content": content,
            "format": "markdown"
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/performance")
async def generate_performance_report(
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate PROJECT_PERFORMANCE_SUMMARY.md style report.
    Focuses on quantitative achievements and metrics.
    """
    report_service = ReportService(db)
    try:
        content = await report_service.generate_performance_summary(user_id)
        return {
            "report_type": "performance_summary",
            "content": content,
            "format": "markdown"
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/company-integrated")
async def generate_company_integrated_report(
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate company-integrated report.
    Groups projects by company with aggregated tech stacks.
    """
    report_service = ReportService(db)
    try:
        content = await report_service.generate_company_integrated_report(user_id)
        return {
            "report_type": "company_integrated",
            "content": content,
            "format": "markdown"
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/all")
async def generate_all_reports(
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate all report formats at once.
    Returns projects_md, performance_summary, and company_integrated reports.
    """
    report_service = ReportService(db)
    try:
        reports = await report_service.generate_full_report(user_id)
        return {
            "reports": reports,
            "formats": ["projects_md", "performance_summary", "company_integrated"]
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/download/{report_type}")
async def download_report(
    report_type: Literal["projects", "performance", "company-integrated"] = "projects",
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """
    Download a report as markdown file.
    """
    report_service = ReportService(db)

    try:
        if report_type == "projects":
            content = await report_service.generate_projects_md(user_id)
            filename = "PROJECTS.md"
        elif report_type == "performance":
            content = await report_service.generate_performance_summary(user_id)
            filename = "PROJECT_PERFORMANCE_SUMMARY.md"
        else:  # company-integrated
            content = await report_service.generate_company_integrated_report(user_id)
            filename = "COMPANY_INTEGRATED_REPORT.md"

        return Response(
            content=content,
            media_type="text/markdown",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/project/{project_id}/detailed")
async def get_detailed_report(
    project_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Generate DETAILED_COMPLETION_REPORT style for a specific project.
    Returns structured data for detailed technical analysis view.
    """
    report_service = ReportProjectService(db)
    try:
        report = await report_service.generate_detailed_report(project_id)
        return report
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/project/{project_id}/final")
async def get_final_report(
    project_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Generate FINAL_PROJECT_REPORT style for a specific project.
    Returns structured data for work/achievement summary view.
    """
    report_service = ReportProjectService(db)
    try:
        report = await report_service.generate_final_report(project_id)
        return report
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/project/{project_id}/summary")
async def get_performance_summary_for_project(
    project_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Generate PROJECT_PERFORMANCE_SUMMARY style for a specific project.
    Returns structured data for basic info, key tasks, achievements, and stats.
    """
    report_service = ReportProjectService(db)
    try:
        report = await report_service.generate_performance_summary_for_project(project_id)
        return report
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
