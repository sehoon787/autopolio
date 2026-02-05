"""
Pipeline Service - Orchestrates the 7-step document generation pipeline.

Pipeline Steps:
1. GitHub Analysis - Analyze commits and code
2. Code Extraction - Extract patterns and architecture
3. Tech Detection - Auto-detect technologies
4. Achievement Detection - Auto-detect achievements
5. LLM Summarization - Generate AI summaries
6. Template Mapping - Map data to template
7. Document Generation - Create final document

Performance Optimizations (v1.9):
- Parallel GitHub analysis for multiple projects
- Parallel LLM summarization for multiple projects
- Concurrency limits to respect API rate limits
"""
import asyncio
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
import time

logger = logging.getLogger(__name__)

# Concurrency limits for parallel operations
MAX_CONCURRENT_GITHUB_ANALYSIS = 3  # GitHub API rate limit consideration
MAX_CONCURRENT_LLM_SUMMARY = 2  # LLM API rate limit consideration

from api.models.user import User
from api.models.project import Project, ProjectTechnology
from api.models.company import Company
from api.models.template import Template
from api.models.document import GeneratedDocument
from api.models.repo_analysis import RepoAnalysis
from api.models.achievement import ProjectAchievement
from api.services.task_service import TaskService
from api.services.github_service import GitHubService
from api.services.llm_service import LLMService
from api.services.cli_llm_service import CLILLMService
from api.services.document_service import DocumentService
from api.services.encryption_service import EncryptionService
from api.services.achievement_service import AchievementService
from api.schemas.pipeline import PipelineRunRequest


class PipelineService:
    """Service for running the document generation pipeline."""

    STEP_NAMES = [
        "GitHub Analysis",
        "Code Extraction",
        "Tech Detection",
        "Achievement Detection",
        "LLM Summarization",
        "Template Mapping",
        "Document Generation"
    ]

    def __init__(self, db: AsyncSession, user_id: int):
        self.db = db
        self.user_id = user_id
        self.task_service = TaskService(db)
        self.document_service = DocumentService()
        self.encryption = EncryptionService()

    async def run_pipeline(
        self,
        task_id: str,
        request: PipelineRunRequest
    ) -> Dict[str, Any]:
        """Run the complete pipeline."""
        start_time = time.time()
        llm_tokens = 0

        try:
            # Start the job
            await self.task_service.start_job(task_id)

            # Get user
            user_result = await self.db.execute(
                select(User).where(User.id == self.user_id)
            )
            user = user_result.scalar_one_or_none()
            if not user:
                raise ValueError("User not found")

            # Step 1: GitHub Analysis
            github_results = await self._step_github_analysis(
                task_id, request, user
            )

            # Step 2: Code Extraction
            code_results = await self._step_code_extraction(
                task_id, request, github_results
            )

            # Step 3: Tech Detection
            tech_results = await self._step_tech_detection(
                task_id, request, code_results
            )

            # Step 4: Achievement Detection
            achievement_results = await self._step_achievement_detection(
                task_id, request, user
            )

            # Step 5: LLM Summarization
            summary_results, tokens = await self._step_llm_summarization(
                task_id, request, user, tech_results
            )
            llm_tokens += tokens

            # Step 6: Template Mapping
            mapping_results = await self._step_template_mapping(
                task_id, request, user, summary_results
            )

            # Step 7: Document Generation
            document = await self._step_document_generation(
                task_id, request, mapping_results
            )

            # Calculate generation time
            generation_time = time.time() - start_time
            llm_provider = request.llm_provider or (user.preferred_llm if user else None)

            # Complete the job
            cli_mode = getattr(request, 'cli_mode', None)
            output_data = {
                "document_id": document.id,
                "document_name": document.document_name,
                "file_path": document.file_path,
                "file_format": document.file_format,
                "file_size": document.file_size,
                "generation_time_seconds": round(generation_time, 2),
                "projects_processed": len(request.project_ids),
                "llm_tokens_used": llm_tokens,
                "llm_provider": llm_provider,
                "llm_execution_mode": "cli" if cli_mode else "api",
                "llm_cli_type": cli_mode if cli_mode else None,
            }

            await self.task_service.complete_job(task_id, output_data)
            return output_data

        except Exception as e:
            await self.task_service.fail_job(
                task_id,
                str(e),
                {"exception_type": type(e).__name__}
            )
            raise

    async def _analyze_single_project(
        self,
        semaphore: asyncio.Semaphore,
        github_service: GitHubService,
        project: Project,
        username: str
    ) -> Dict[str, Any]:
        """Analyze a single project with semaphore for rate limiting."""
        async with semaphore:
            try:
                analysis = await github_service.analyze_repository(
                    project.git_url,
                    username
                )
                return {
                    "project_id": project.id,
                    "project": project,
                    "analysis": analysis,
                    "success": True
                }
            except Exception as e:
                logger.warning("Failed to analyze project %s: %s", project.id, e)
                return {
                    "project_id": project.id,
                    "project": project,
                    "analysis": None,
                    "success": False,
                    "error": str(e)
                }

    async def _step_github_analysis(
        self,
        task_id: str,
        request: PipelineRunRequest,
        user: User
    ) -> Dict[str, Any]:
        """Step 1: Analyze GitHub repositories.

        Performance: Uses parallel analysis for multiple projects.
        """
        results = {"analyses": [], "skipped": []}

        await self.task_service.start_step(task_id, 1, self.STEP_NAMES[0])

        # Get projects with git URLs
        projects_result = await self.db.execute(
            select(Project)
            .where(Project.id.in_(request.project_ids))
            .where(Project.git_url.isnot(None))
        )
        projects = projects_result.scalars().all()

        # Check if user has GitHub connected
        if user.github_token_encrypted:
            token = self.encryption.decrypt(user.github_token_encrypted)
            github_service = GitHubService(token)

            # Filter projects that need analysis
            # Only analyze unanalyzed projects if auto_analyze is true
            projects_to_analyze = []
            for project in projects:
                if project.is_analyzed:
                    results["skipped"].append(project.id)
                elif request.auto_analyze:
                    # Auto-analyze unanalyzed projects
                    projects_to_analyze.append(project)
                else:
                    # Skip unanalyzed projects if auto_analyze is false
                    results["skipped"].append(project.id)

            if projects_to_analyze:
                # Parallel analysis with semaphore
                semaphore = asyncio.Semaphore(MAX_CONCURRENT_GITHUB_ANALYSIS)
                tasks = [
                    self._analyze_single_project(
                        semaphore, github_service, project, user.github_username
                    )
                    for project in projects_to_analyze
                ]

                analysis_results = await asyncio.gather(*tasks, return_exceptions=True)

                # Process results
                for result in analysis_results:
                    if isinstance(result, Exception):
                        continue
                    if not result.get("success"):
                        results["skipped"].append(result["project_id"])
                        continue

                    project = result["project"]
                    analysis = result["analysis"]

                    # Save analysis
                    existing = await self.db.execute(
                        select(RepoAnalysis).where(RepoAnalysis.project_id == project.id)
                    )
                    repo_analysis = existing.scalar_one_or_none()

                    if repo_analysis:
                        for key, value in analysis.items():
                            setattr(repo_analysis, key, value)
                    else:
                        repo_analysis = RepoAnalysis(
                            project_id=project.id,
                            git_url=project.git_url,
                            **analysis
                        )
                        self.db.add(repo_analysis)

                    project.is_analyzed = 1
                    results["analyses"].append({
                        "project_id": project.id,
                        "analysis": analysis
                    })

            await self.db.flush()

        # Check if all projects were skipped (already analyzed)
        if len(results["skipped"]) == len(request.project_ids) and not results["analyses"]:
            # All projects were already analyzed - mark step as skipped
            await self.task_service.skip_step(
                task_id, 1, self.STEP_NAMES[0],
                reason="all_projects_analyzed",
                result=results
            )
        else:
            await self.task_service.complete_step(task_id, 1, results)

        return results

    async def _step_code_extraction(
        self,
        task_id: str,
        request: PipelineRunRequest,
        github_results: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Step 2: Extract code patterns and architecture."""
        await self.task_service.start_step(task_id, 2, self.STEP_NAMES[1])

        results = {"patterns": [], "architectures": []}

        # Get existing repo analyses
        analyses_result = await self.db.execute(
            select(RepoAnalysis)
            .where(RepoAnalysis.project_id.in_(request.project_ids))
        )
        analyses = analyses_result.scalars().all()

        for analysis in analyses:
            patterns = analysis.architecture_patterns or []
            results["patterns"].extend(patterns)

            # Extract from commit categories
            categories = analysis.commit_categories or {}
            if categories:
                results["architectures"].append({
                    "project_id": analysis.project_id,
                    "commit_distribution": categories
                })

        await self.task_service.complete_step(task_id, 2, results)
        return results

    async def _step_tech_detection(
        self,
        task_id: str,
        request: PipelineRunRequest,
        code_results: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Step 3: Detect and consolidate technologies."""
        await self.task_service.start_step(task_id, 3, self.STEP_NAMES[2])

        results = {"technologies": {}, "primary_stack": []}

        # Get repo analyses
        analyses_result = await self.db.execute(
            select(RepoAnalysis)
            .where(RepoAnalysis.project_id.in_(request.project_ids))
        )
        analyses = analyses_result.scalars().all()

        all_techs = {}
        for analysis in analyses:
            detected = analysis.detected_technologies or []
            for tech in detected:
                all_techs[tech] = all_techs.get(tech, 0) + 1

        # Sort by frequency
        sorted_techs = sorted(all_techs.items(), key=lambda x: x[1], reverse=True)
        results["technologies"] = dict(sorted_techs)
        results["primary_stack"] = [t[0] for t in sorted_techs[:10]]

        await self.task_service.complete_step(task_id, 3, results)
        return results

    async def _step_achievement_detection(
        self,
        task_id: str,
        request: PipelineRunRequest,
        user: User
    ) -> Dict[str, Any]:
        """Step 4: Detect achievements from project data."""
        await self.task_service.start_step(task_id, 4, self.STEP_NAMES[3])

        results = {"projects": [], "total_detected": 0, "total_saved": 0}

        # Get LLM provider for achievement detection
        llm_provider = request.llm_provider or user.preferred_llm

        # Get projects with repo analysis
        projects_result = await self.db.execute(
            select(Project)
            .where(Project.id.in_(request.project_ids))
            .options(
                selectinload(Project.technologies).selectinload(ProjectTechnology.technology),
                selectinload(Project.repo_analysis),
                selectinload(Project.achievements)
            )
        )
        projects = projects_result.scalars().all()

        for project in projects:
            # Prepare project data
            project_data = {
                "name": project.name,
                "description": project.description or "",
                "role": project.role,
                "team_size": project.team_size,
                "contribution_percent": project.contribution_percent,
                "technologies": [pt.technology.name for pt in project.technologies],
                "total_commits": 0,
                "lines_added": 0,
                "lines_deleted": 0,
                "files_changed": 0,
                "commit_categories": {},
                "commit_summary": None
            }

            commit_messages = []
            if project.repo_analysis:
                repo_analysis = project.repo_analysis
                project_data.update({
                    "total_commits": repo_analysis.total_commits or 0,
                    "lines_added": repo_analysis.lines_added or 0,
                    "lines_deleted": repo_analysis.lines_deleted or 0,
                    "files_changed": repo_analysis.files_changed or 0,
                    "commit_categories": repo_analysis.commit_categories or {},
                    "commit_summary": repo_analysis.commit_messages_summary
                })
                if repo_analysis.commit_messages_summary:
                    commit_messages = repo_analysis.commit_messages_summary.split("\n")

            # Detect achievements (skip LLM in pipeline to save tokens)
            achievement_service = AchievementService(llm_provider=None)
            detected_achievements, stats = await achievement_service.detect_all(
                project_data=project_data,
                commit_messages=commit_messages,
                use_llm=False  # Skip LLM in pipeline, can be done separately
            )

            # Filter out existing achievements
            existing_keys = {(a.metric_name, a.metric_value) for a in project.achievements}
            new_achievements = [
                a for a in detected_achievements
                if (a["metric_name"], a["metric_value"]) not in existing_keys
            ]

            # Save new achievements
            saved_count = 0
            for i, a in enumerate(new_achievements):
                achievement = ProjectAchievement(
                    project_id=project.id,
                    metric_name=a["metric_name"],
                    metric_value=a["metric_value"],
                    description=a.get("description"),
                    category=a.get("category"),
                    evidence=a.get("evidence"),
                    display_order=len(project.achievements) + i
                )
                self.db.add(achievement)
                saved_count += 1

            results["projects"].append({
                "project_id": project.id,
                "detected": len(new_achievements),
                "saved": saved_count
            })
            results["total_detected"] += len(new_achievements)
            results["total_saved"] += saved_count

        await self.db.flush()
        await self.task_service.complete_step(task_id, 4, results)
        return results

    async def _generate_single_summary(
        self,
        semaphore: asyncio.Semaphore,
        llm_service,
        project: Project,
        summary_style: str
    ) -> Dict[str, Any]:
        """Generate summary for a single project with semaphore for rate limiting."""
        async with semaphore:
            try:
                # Prepare project data
                project_data = {
                    "name": project.name,
                    "description": project.description,
                    "role": project.role,
                    "team_size": project.team_size,
                    "contribution_percent": project.contribution_percent,
                    "technologies": [pt.technology.name for pt in project.technologies],
                    "start_date": str(project.start_date) if project.start_date else None,
                    "end_date": str(project.end_date) if project.end_date else None,
                }

                # Add repo analysis data if available
                if project.repo_analysis:
                    project_data["total_commits"] = project.repo_analysis.total_commits
                    project_data["commit_summary"] = project.repo_analysis.commit_messages_summary

                # Generate summary
                summary_result = await llm_service.generate_project_summary(
                    project_data,
                    summary_style
                )

                return {
                    "project_id": project.id,
                    "project": project,
                    "summary": summary_result,
                    "success": True
                }
            except Exception as e:
                logger.warning("Failed to generate summary for project %s: %s", project.id, e)
                return {
                    "project_id": project.id,
                    "project": project,
                    "summary": None,
                    "success": False,
                    "error": str(e)
                }

    async def _step_llm_summarization(
        self,
        task_id: str,
        request: PipelineRunRequest,
        user: User,
        tech_results: Dict[str, Any]
    ) -> tuple[Dict[str, Any], int]:
        """Step 5: Use pre-generated summaries from analysis, or generate new ones.

        v1.12 Update: AI summaries are now generated during analysis, not pipeline.
        This step primarily copies summaries from RepoAnalysis to Project.
        LLM generation is a fallback for projects without analysis.
        """
        results = {"summaries": [], "tokens_used": 0, "copied_from_analysis": 0}

        await self.task_service.start_step(task_id, 5, self.STEP_NAMES[4])

        try:
            # Get projects with their repo_analysis
            projects_result = await self.db.execute(
                select(Project)
                .where(Project.id.in_(request.project_ids))
                .options(
                    selectinload(Project.technologies).selectinload(ProjectTechnology.technology),
                    selectinload(Project.achievements),
                    selectinload(Project.repo_analysis)
                )
            )
            projects = projects_result.scalars().all()

            # Step 1: Copy summaries from RepoAnalysis to Project (if available)
            projects_needing_llm = []
            for project in projects:
                # If project already has AI summary, use it
                if project.ai_summary:
                    results["summaries"].append({
                        "project_id": project.id,
                        "summary": {"summary": project.ai_summary, "key_features": project.ai_key_features},
                        "source": "existing"
                    })
                    continue

                # Check if RepoAnalysis has ai_summary (generated during analysis)
                if project.repo_analysis and project.repo_analysis.ai_summary:
                    # Copy from RepoAnalysis to Project
                    project.ai_summary = project.repo_analysis.ai_summary
                    project.ai_key_features = project.repo_analysis.ai_key_features
                    results["copied_from_analysis"] += 1
                    results["summaries"].append({
                        "project_id": project.id,
                        "summary": {
                            "summary": project.repo_analysis.ai_summary,
                            "key_features": project.repo_analysis.ai_key_features
                        },
                        "source": "analysis"
                    })
                    logger.info("Copied ai_summary from RepoAnalysis for project %d", project.id)
                else:
                    # No summary in RepoAnalysis, need LLM generation
                    projects_needing_llm.append(project)

            # Step 2: Generate summaries for projects without analysis (fallback)
            if projects_needing_llm:
                logger.info("Generating LLM summaries for %d projects without analysis", len(projects_needing_llm))

                # Initialize LLM service
                provider = request.llm_provider or user.preferred_llm
                cli_mode = getattr(request, 'cli_mode', None)
                cli_model = getattr(request, 'cli_model', None)
                if cli_mode:
                    logger.info("Using CLI mode: %s, model: %s", cli_mode, cli_model)
                    llm_service = CLILLMService(cli_mode, model=cli_model)
                else:
                    user_model = None
                    if provider == "openai":
                        user_model = getattr(user, 'openai_model', None)
                    elif provider == "anthropic":
                        user_model = getattr(user, 'anthropic_model', None)
                    elif provider == "gemini":
                        user_model = getattr(user, 'gemini_model', None)
                    logger.info("Using API mode: provider=%s, model=%s", provider, user_model)
                    llm_service = LLMService(provider, model=user_model)

                # Get user's summary style preference
                summary_style = getattr(user, 'default_summary_style', 'professional') or 'professional'

                # Parallel summarization
                semaphore = asyncio.Semaphore(MAX_CONCURRENT_LLM_SUMMARY)
                tasks = [
                    self._generate_single_summary(
                        semaphore, llm_service, project, summary_style
                    )
                    for project in projects_needing_llm
                ]

                summary_results = await asyncio.gather(*tasks, return_exceptions=True)

                # Process LLM results
                for result in summary_results:
                    if isinstance(result, Exception):
                        logger.warning("Summary generation exception: %s", result)
                        continue
                    if not result.get("success"):
                        continue

                    project = result["project"]
                    summary = result["summary"]

                    project.ai_summary = summary.get("summary", "")
                    project.ai_key_features = summary.get("key_features", [])

                    results["summaries"].append({
                        "project_id": project.id,
                        "summary": summary,
                        "source": "llm"
                    })

                results["tokens_used"] = llm_service.total_tokens_used

            # Check if all projects were skipped
            if not results["summaries"] and not projects_needing_llm:
                results["skipped_projects"] = [p.id for p in projects]
                await self.task_service.skip_step(
                    task_id, 5, self.STEP_NAMES[4],
                    reason="all_projects_have_summaries",
                    result=results
                )
                return results, 0

            await self.db.flush()

        except Exception as e:
            results["error"] = str(e)
            logger.exception("Step 5 error: %s", e)

        await self.task_service.complete_step(task_id, 5, results)
        return results, results.get("tokens_used", 0)

    async def _step_template_mapping(
        self,
        task_id: str,
        request: PipelineRunRequest,
        user: User,
        summary_results: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Step 6: Map data to template fields."""
        await self.task_service.start_step(task_id, 6, self.STEP_NAMES[5])

        # Get template
        template_result = await self.db.execute(
            select(Template).where(Template.id == request.template_id)
        )
        template = template_result.scalar_one_or_none()
        if not template:
            raise ValueError("Template not found")

        # Get companies
        companies_result = await self.db.execute(
            select(Company).where(Company.user_id == self.user_id)
        )
        companies = companies_result.scalars().all()

        # Filter by company_ids if specified
        if request.company_ids:
            companies = [c for c in companies if c.id in request.company_ids]

        # Get projects with all relations
        projects_result = await self.db.execute(
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
        project_achievements_data = {}  # Stores summary_list and detailed_list

        for p in projects:
            analysis_result = await self.db.execute(
                select(RepoAnalysis).where(RepoAnalysis.project_id == p.id)
            )
            analysis = analysis_result.scalar_one_or_none()
            if analysis:
                # Check for user edits first
                edits_result = await self.db.execute(
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
        template_data = self.document_service.prepare_template_data(
            user_data={
                # Basic info
                "name": user.display_name or user.name,
                "email": user.profile_email or user.email,
                "github_username": user.github_username,
                # Personal info
                "phone": user.phone or "",
                "address": user.address or "",
                "birthdate": str(user.birthdate) if user.birthdate else "",
            },
            companies=[
                {
                    "id": c.id,  # Include ID for project-company lookup
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
                    "company_id": p.company_id,  # For company info enrichment
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
                    # Basic achievements from ProjectAchievement model
                    "achievements": [
                        {
                            "metric_name": a.metric_name,
                            "metric_value": a.metric_value,
                            "description": a.description
                        }
                        for a in p.achievements
                    ] if request.include_achievements else [],
                    # Summary/Detailed achievements from RepoAnalysis.detailed_achievements
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
            "template_platform": template.platform,  # For specialized document generation
            "data": template_data,
            "output_format": request.output_format
        }

        await self.task_service.complete_step(task_id, 6, {"mapped": True})
        return results

    async def _step_document_generation(
        self,
        task_id: str,
        request: PipelineRunRequest,
        mapping_results: Dict[str, Any]
    ) -> GeneratedDocument:
        """Step 7: Generate the final document."""
        await self.task_service.start_step(task_id, 7, self.STEP_NAMES[6])

        # Generate document name
        document_name = request.document_name or f"Resume_{datetime.now().strftime('%Y%m%d')}"

        # Generate document
        file_path, file_size = await self.document_service.generate_document(
            template_content=mapping_results["template_content"],
            data=mapping_results["data"],
            output_format=request.output_format,
            document_name=document_name,
            template_platform=mapping_results.get("template_platform")
        )

        # Save document record
        document = GeneratedDocument(
            user_id=self.user_id,
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
        self.db.add(document)
        await self.db.flush()
        await self.db.refresh(document)

        await self.task_service.complete_step(task_id, 7, {
            "document_id": document.id,
            "file_path": file_path
        })

        return document
