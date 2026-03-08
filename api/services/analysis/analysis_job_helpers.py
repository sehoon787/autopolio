"""
Analysis Job Helpers - Shared LLM helper functions for background analysis.

Used by both single-repo (analysis_job_runner) and multi-repo (analysis_job_multi)
background analysis flows.
"""

import json
import logging
from typing import Dict, Any, List, Tuple

from sqlalchemy import select

from api.models.project import Project
from api.models.repo_analysis import RepoAnalysis
from api.models.achievement import ProjectAchievement
from api.models.contributor_analysis import ContributorAnalysis
from api.database import AsyncSessionLocal
from api.services.llm.llm_utils import parse_json_from_llm
from api.constants import LLM_MAX_TOKENS, SummaryStyle

logger = logging.getLogger(__name__)

# Fields from detailed_content dict that map 1:1 to RepoAnalysis columns
_DETAILED_CONTENT_FIELDS = [
    "implementation_details",
    "development_timeline",
    "detailed_achievements",
    "architecture_patterns",
]


def apply_detailed_content(
    repo_analysis: "RepoAnalysis", detailed_content: Dict[str, Any]
) -> None:
    """Apply detailed_content dict fields to a RepoAnalysis model.

    Shared by both sync (phase5_save_llm_results) and background (save_llm_results)
    save paths to avoid field-list duplication.
    """
    for field in _DETAILED_CONTENT_FIELDS:
        value = detailed_content.get(field)
        if value:
            setattr(repo_analysis, field, value)


def build_summary_project_data(
    project, analysis_result: Dict[str, Any] = None
) -> Dict[str, Any]:
    """Build a project data dict for LLM summary generation.

    Used by analysis_job_runner (single-repo), analysis_job_multi, and pipeline_steps.
    """
    data = {
        "name": project.name,
        "description": project.description,
        "role": project.role,
        "team_size": project.team_size,
        "contribution_percent": project.contribution_percent,
        "start_date": str(project.start_date) if project.start_date else None,
        "end_date": str(project.end_date) if project.end_date else None,
    }
    if analysis_result:
        data["technologies"] = analysis_result.get("detected_technologies", [])
        data["total_commits"] = analysis_result.get("total_commits", 0)
        data["commit_summary"] = analysis_result.get("commit_messages_summary", "")
    return data


async def _generate_key_tasks_bg(
    project_id: int, analysis_result: Dict[str, Any], llm_service, language: str = "ko"
) -> Tuple[List[str], int]:
    """Generate key tasks using LLM for background analysis."""
    async with AsyncSessionLocal() as db:
        proj_result = await db.execute(select(Project).where(Project.id == project_id))
        project = proj_result.scalar_one_or_none()
        if not project:
            return [], 0

        technologies = analysis_result.get("detected_technologies", [])
        commit_summary = analysis_result.get("commit_messages_summary", "")
        commit_categories = analysis_result.get("commit_categories", {})

        if language == "en":
            commit_context = ""
            if commit_categories:
                parts = []
                if commit_categories.get("feature", 0) > 0:
                    parts.append(f"New features: {commit_categories['feature']}")
                if commit_categories.get("fix", 0) > 0:
                    parts.append(f"Bug fixes: {commit_categories['fix']}")
                if commit_categories.get("refactor", 0) > 0:
                    parts.append(f"Refactoring: {commit_categories['refactor']}")
                commit_context = ", ".join(parts)

            prompt = f"""Based on the following project information, extract 3-5 key tasks/responsibilities.

Project: {project.name}
Description: {project.description or "N/A"}
Role: {project.role or "Developer"}
Tech Stack: {", ".join(technologies[:10]) if technologies else "N/A"}
Commit Summary: {commit_context or "N/A"}
Commit Messages:
{commit_summary[:500] if commit_summary else "N/A"}

Each task should be specific and suitable for a resume.
Examples:
- "Designed and developed RESTful APIs"
- "Database modeling and query optimization"

IMPORTANT: ALL output MUST be in English. If the input data (commit messages, descriptions) is in Korean or another language, translate and summarize in English.

Respond ONLY with a JSON array:
["task1", "task2", "task3"]
"""
        else:
            commit_context = ""
            if commit_categories:
                parts = []
                if commit_categories.get("feature", 0) > 0:
                    parts.append(f"신규 기능 개발 {commit_categories['feature']}건")
                if commit_categories.get("fix", 0) > 0:
                    parts.append(f"버그 수정 {commit_categories['fix']}건")
                if commit_categories.get("refactor", 0) > 0:
                    parts.append(f"리팩토링 {commit_categories['refactor']}건")
                commit_context = ", ".join(parts)

            prompt = f"""다음 프로젝트 정보를 바탕으로 주요 수행 업무 3-5개를 추출해주세요.

프로젝트: {project.name}
설명: {project.description or "N/A"}
역할: {project.role or "개발자"}
기술 스택: {", ".join(technologies[:10]) if technologies else "N/A"}
커밋 현황: {commit_context or "N/A"}
커밋 메시지 요약:
{commit_summary[:500] if commit_summary else "N/A"}

각 업무는 구체적이고 이력서에 적합한 형태로 작성해주세요.
예시:
- "RESTful API 설계 및 개발"
- "데이터베이스 모델링 및 쿼리 최적화"

JSON 배열 형식으로만 응답하세요:
["업무1", "업무2", "업무3"]
"""

        try:
            system_prompt = (
                "You are an expert at extracting key tasks from development projects. Respond ONLY with a JSON array."
                if language == "en"
                else "당신은 개발 프로젝트의 주요 업무를 추출하는 전문가입니다. JSON 배열 형식으로만 응답하세요."
            )

            # Both LLMService and CLILLMService have .provider attribute
            # CLILLMProvider.generate() delegates to generate_with_cli() internally
            response, tokens = await llm_service.provider.generate(
                prompt,
                system_prompt=system_prompt,
                max_tokens=LLM_MAX_TOKENS.SUMMARY,
                temperature=0.3,
            )

            print(
                f"[_generate_key_tasks_bg] Response len={len(response) if response else 0}, "
                f"tokens={tokens}, preview={repr((response or '')[:300])}",
                flush=True,
            )

            tasks = parse_json_from_llm(response)

            if isinstance(tasks, list):
                cleaned = [str(t).strip() for t in tasks if t and str(t).strip()]
                if cleaned:
                    logger.info(
                        "[_generate_key_tasks_bg] Extracted %d tasks", len(cleaned[:5])
                    )
                    return cleaned[:5], tokens

            logger.warning(
                "[_generate_key_tasks_bg] Unexpected format: %s (preview=%.200s)",
                type(tasks).__name__,
                str(tasks)[:200],
            )
            return [], tokens

        except json.JSONDecodeError as e:
            logger.error(
                "[_generate_key_tasks_bg] JSON parse failed: %s (response=%.300s)",
                e,
                (response if "response" in dir() else "N/A")[:300]
                if response
                else "empty",
            )
            return [], 0
        except Exception as e:
            logger.error("[_generate_key_tasks_bg] Failed: %s: %s", type(e).__name__, e)
            return [], 0


async def _generate_combined_ai_summary(
    project_id: int,
    llm_service,
    language: str = "ko",
    summary_style: str = SummaryStyle.PROFESSIONAL,
) -> int:
    """Generate a holistic AI summary from all repo analyses of a project.

    Reads all RepoAnalysis rows for the project, collects per-repo
    summaries/key_tasks/technologies, then calls
    llm_service.generate_multi_repo_summary() to produce a unified narrative.
    Saves the result to Project.ai_summary and Project.ai_key_features.

    Returns tokens used.
    """
    from sqlalchemy.orm import selectinload

    async with AsyncSessionLocal() as db:
        proj_result = await db.execute(
            select(Project)
            .where(Project.id == project_id)
            .options(selectinload(Project.repositories))
        )
        project = proj_result.scalar_one_or_none()
        if not project:
            return 0

        analyses_result = await db.execute(
            select(RepoAnalysis)
            .where(RepoAnalysis.project_id == project_id)
            .options(selectinload(RepoAnalysis.project_repository))
        )
        analyses = list(analyses_result.scalars().all())

        if len(analyses) < 2:
            # Single repo — no combined summary needed
            return 0

        repo_summaries = []
        for analysis in analyses:
            label = "Repository"
            if analysis.project_repository:
                label = analysis.project_repository.label or analysis.git_url.split(
                    "/"
                )[-1].replace(".git", "")
            elif analysis.git_url:
                label = analysis.git_url.split("/")[-1].replace(".git", "")

            repo_summaries.append(
                {
                    "label": label,
                    "git_url": analysis.git_url or "",
                    "ai_summary": analysis.ai_summary or "",
                    "key_tasks": analysis.key_tasks or [],
                    "technologies": analysis.detected_technologies or [],
                }
            )

        project_data = build_summary_project_data(project)

    summary_result = await llm_service.generate_multi_repo_summary(
        project_data=project_data,
        repo_summaries=repo_summaries,
        style=summary_style,
        language=language,
    )

    tokens = summary_result.get("token_usage", 0)
    combined_summary = summary_result.get("summary", "")
    combined_features = summary_result.get("key_features", [])

    if combined_summary:
        async with AsyncSessionLocal() as db:
            proj_result = await db.execute(
                select(Project).where(Project.id == project_id)
            )
            project = proj_result.scalar_one_or_none()
            if project:
                project.ai_summary = combined_summary
                if combined_features:
                    project.ai_key_features = combined_features
                await db.commit()
                logger.info(
                    "[MultiRepoAnalysis] Combined AI summary saved for project %d (%d tokens)",
                    project_id,
                    tokens,
                )

    return tokens


async def save_repo_basic_results(
    project_id: int,
    project_repository_id: int,
    git_url: str,
    is_primary: bool,
    detected_role: str,
    analysis_result: Dict[str, Any],
    llm_service,
    language: str,
) -> int:
    """Save basic repo analysis results and auto-detect achievements.

    Returns the repo_analysis.id for further use.
    """
    from api.services.achievement import AchievementService

    async with AsyncSessionLocal() as db:
        proj_result = await db.execute(select(Project).where(Project.id == project_id))
        project = proj_result.scalar_one_or_none()
        if not project:
            raise ValueError(f"Project not found: {project_id}")

        analysis_db_result = await db.execute(
            select(RepoAnalysis).where(
                RepoAnalysis.project_repository_id == project_repository_id
            )
        )
        repo_analysis = analysis_db_result.scalar_one_or_none()

        if repo_analysis:
            for key, value in analysis_result.items():
                if hasattr(repo_analysis, key):
                    setattr(repo_analysis, key, value)
        else:
            repo_analysis = RepoAnalysis(
                project_id=project_id,
                project_repository_id=project_repository_id,
                git_url=git_url,
                **analysis_result,
            )
            db.add(repo_analysis)

        if is_primary:
            if not project.role and detected_role:
                project.role = detected_role
            project.git_url = git_url
        project.is_analyzed = 1

        try:
            achievement_service = AchievementService(llm_provider=None)
            project_data = {
                "name": project.name,
                "description": project.description or "",
                "role": project.role or "",
                "total_commits": repo_analysis.total_commits or 0,
                "lines_added": repo_analysis.lines_added or 0,
                "lines_deleted": repo_analysis.lines_deleted or 0,
                "files_changed": repo_analysis.files_changed or 0,
                "commit_categories": repo_analysis.commit_categories or {},
            }
            commit_messages = []
            if repo_analysis.commit_messages_summary:
                commit_messages = repo_analysis.commit_messages_summary.split("\n")

            achievements, _ = await achievement_service.detect_all(
                project_data=project_data,
                commit_messages=commit_messages,
                use_llm=False,
                language=language,
            )

            if achievements and is_primary:
                await db.execute(
                    ProjectAchievement.__table__.delete().where(
                        ProjectAchievement.project_id == project_id
                    )
                )
                for achievement in achievements:
                    db.add(
                        ProjectAchievement(
                            project_id=project_id,
                            metric_name=achievement.get("metric_name", ""),
                            metric_value=achievement.get("metric_value", ""),
                            description=achievement.get("description"),
                            category=achievement.get("category"),
                            evidence=achievement.get("evidence"),
                        )
                    )
        except Exception as e:
            logger.warning(
                "[Analysis] Achievement detection failed for %s: %s", git_url, e
            )

        await db.commit()
        return repo_analysis.id


async def save_llm_results(
    analysis_id: int,
    project_id: int,
    is_primary: bool,
    language: str,
    key_tasks: List[str],
    detailed_content: Dict[str, Any],
    ai_summary: str = None,
    ai_key_features: List[str] = None,
    user_code_contributions: Dict[str, Any] = None,
) -> None:
    """Save LLM-generated results to RepoAnalysis and optionally to Project."""
    logger.info(
        "[save_llm_results] analysis_id=%d, key_tasks=%d, ai_summary=%s, ai_key_features=%s",
        analysis_id,
        len(key_tasks) if key_tasks else 0,
        bool(ai_summary),
        len(ai_key_features) if ai_key_features else 0,
    )
    async with AsyncSessionLocal() as db:
        analysis_db_result = await db.execute(
            select(RepoAnalysis).where(RepoAnalysis.id == analysis_id)
        )
        repo_analysis = analysis_db_result.scalar_one_or_none()
        if not repo_analysis:
            return

        repo_analysis.analysis_language = language
        if key_tasks is not None:
            repo_analysis.key_tasks = key_tasks
        apply_detailed_content(repo_analysis, detailed_content)
        if ai_summary:
            repo_analysis.ai_summary = ai_summary
        if ai_key_features:
            repo_analysis.ai_key_features = ai_key_features
        if user_code_contributions:
            repo_analysis.user_code_contributions = {
                "summary": user_code_contributions.get("summary", {}),
                "technologies": user_code_contributions.get("technologies", []),
                "work_areas": user_code_contributions.get("work_areas", []),
            }
        await db.commit()

        if is_primary and (ai_summary or ai_key_features):
            proj_result = await db.execute(
                select(Project).where(Project.id == project_id)
            )
            project = proj_result.scalar_one_or_none()
            if project:
                if ai_summary:
                    project.ai_summary = ai_summary
                if ai_key_features:
                    project.ai_key_features = ai_key_features
                await db.commit()


async def save_contributor_analysis(
    analysis_id: int,
    github_service,
    git_url: str,
    github_username: str,
    label_prefix: str = "",
) -> None:
    """Run and save contributor analysis for the specified user."""
    contributor_data = await github_service.analyze_contributor(
        git_url,
        github_username,
        commit_limit=100,
    )
    async with AsyncSessionLocal() as db:
        existing_result = await db.execute(
            select(ContributorAnalysis).where(
                ContributorAnalysis.repo_analysis_id == analysis_id,
                ContributorAnalysis.username == github_username,
            )
        )
        existing = existing_result.scalar_one_or_none()
        fields = {
            "email": contributor_data.get("email"),
            "total_commits": contributor_data.get("total_commits", 0),
            "first_commit_date": contributor_data.get("first_commit_date"),
            "last_commit_date": contributor_data.get("last_commit_date"),
            "lines_added": contributor_data.get("lines_added", 0),
            "lines_deleted": contributor_data.get("lines_deleted", 0),
            "file_extensions": contributor_data.get("file_extensions", {}),
            "work_areas": contributor_data.get("work_areas", []),
            "detected_technologies": contributor_data.get("detected_technologies", []),
            "detailed_commits": contributor_data.get("detailed_commits", []),
            "commit_types": contributor_data.get("commit_types", {}),
        }
        if existing:
            existing.is_primary = True
            for k, v in fields.items():
                setattr(existing, k, v)
        else:
            db.add(
                ContributorAnalysis(
                    repo_analysis_id=analysis_id,
                    username=github_username,
                    is_primary=True,
                    **fields,
                )
            )
        await db.commit()
