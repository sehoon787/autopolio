"""Data migration endpoints for Desktop → Web transfer.

Export: Serialize all user data to JSON (excludes API keys, GitHub tokens).
Import: Deserialize JSON into current user's account (ID remapping).
"""

import logging
from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, inspect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import Date, DateTime

from api.database import get_db
from api.middleware.auth import get_current_user_id
from api.models.user import User
from api.models.company import Company
from api.models.project import Project, ProjectTechnology, Technology
from api.models.achievement import ProjectAchievement
from api.models.credentials import (
    Certification,
    Award,
    Education,
    Publication,
    VolunteerActivity,
)
from api.schemas.data_migration import (
    DataExportResponse,
    DataImportRequest,
    DataImportResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["DataMigration"])


def _coerce_dates(model_cls, data: dict) -> dict:
    """Convert ISO date strings to Python date/datetime objects for SQLAlchemy."""
    mapper = inspect(model_cls)
    for col in mapper.columns:
        if col.name not in data:
            continue
        val = data[col.name]
        if val is None:
            continue
        if isinstance(col.type, Date) and isinstance(val, str):
            try:
                data[col.name] = date.fromisoformat(val)
            except ValueError:
                data[col.name] = None
        elif isinstance(col.type, DateTime) and isinstance(val, str):
            try:
                data[col.name] = datetime.fromisoformat(val)
            except ValueError:
                data[col.name] = None
    return data


def _serialize_date(val) -> str | None:
    if val is None:
        return None
    if isinstance(val, (date, datetime)):
        return val.isoformat()
    return str(val)


def _model_to_dict(obj, exclude: set[str] | None = None) -> dict:
    """Convert SQLAlchemy model instance to dict, excluding relationships and specified fields."""
    exclude = exclude or set()
    exclude.update({"_sa_instance_state"})
    result = {}
    for col in obj.__table__.columns:
        if col.name in exclude:
            continue
        val = getattr(obj, col.name)
        if isinstance(val, (date, datetime)):
            val = val.isoformat()
        result[col.name] = val
    return result


@router.get("/export", response_model=DataExportResponse)
async def export_user_data(
    current_user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Export all user data as JSON.

    Excludes sensitive data: API keys, GitHub token.
    """
    # Load user with relationships
    result = await db.execute(select(User).where(User.id == current_user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Sensitive fields to exclude
    user_exclude = {
        "id",
        "github_token_encrypted",
        "openai_api_key_encrypted",
        "anthropic_api_key_encrypted",
        "gemini_api_key_encrypted",
    }
    user_data = _model_to_dict(user, exclude=user_exclude)

    # Companies
    companies_result = await db.execute(
        select(Company).where(Company.user_id == current_user_id)
    )
    companies = [
        _model_to_dict(c, {"user_id"}) for c in companies_result.scalars().all()
    ]

    # Projects with technologies
    projects_result = await db.execute(
        select(Project)
        .where(Project.user_id == current_user_id)
        .options(
            selectinload(Project.technologies).selectinload(
                ProjectTechnology.technology
            )
        )
    )
    projects_data = []
    tech_set = set()
    for p in projects_result.scalars().all():
        pdict = _model_to_dict(p, {"user_id"})
        # Include technology names for remapping
        pdict["_technology_names"] = []
        for pt in p.technologies:
            if pt.technology:
                pdict["_technology_names"].append(
                    {
                        "name": pt.technology.name,
                        "category": pt.technology.category,
                        "is_primary": pt.is_primary,
                    }
                )
                tech_set.add((pt.technology.name, pt.technology.category))
        projects_data.append(pdict)

    # Technologies (deduplicated)
    technologies = [{"name": name, "category": cat} for name, cat in tech_set]

    # Achievements
    achievements_result = await db.execute(
        select(ProjectAchievement).where(
            ProjectAchievement.project_id.in_(
                select(Project.id).where(Project.user_id == current_user_id)
            )
        )
    )
    achievements = [_model_to_dict(a) for a in achievements_result.scalars().all()]

    # Credentials
    certs_result = await db.execute(
        select(Certification).where(Certification.user_id == current_user_id)
    )
    certifications = [
        _model_to_dict(c, {"user_id"}) for c in certs_result.scalars().all()
    ]

    awards_result = await db.execute(
        select(Award).where(Award.user_id == current_user_id)
    )
    awards = [_model_to_dict(a, {"user_id"}) for a in awards_result.scalars().all()]

    edu_result = await db.execute(
        select(Education).where(Education.user_id == current_user_id)
    )
    educations = [_model_to_dict(e, {"user_id"}) for e in edu_result.scalars().all()]

    pub_result = await db.execute(
        select(Publication).where(Publication.user_id == current_user_id)
    )
    publications = [_model_to_dict(p, {"user_id"}) for p in pub_result.scalars().all()]

    vol_result = await db.execute(
        select(VolunteerActivity).where(VolunteerActivity.user_id == current_user_id)
    )
    volunteer_activities = [
        _model_to_dict(v, {"user_id"}) for v in vol_result.scalars().all()
    ]

    return DataExportResponse(
        exported_at=datetime.utcnow().isoformat(),
        user=user_data,
        companies=companies,
        projects=projects_data,
        achievements=achievements,
        technologies=technologies,
        certifications=certifications,
        awards=awards,
        educations=educations,
        publications=publications,
        volunteer_activities=volunteer_activities,
    )


@router.post("/import", response_model=DataImportResponse)
async def import_user_data(
    data: DataImportRequest,
    current_user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Import user data from JSON export.

    Remaps all IDs to the current user. Company/project IDs are
    tracked for achievement/technology association.
    """
    imported = {}
    skipped = {}
    errors = []

    # Map old company_id → new company_id
    company_id_map: dict[int, int] = {}

    # Import companies
    imported["companies"] = 0
    skipped["companies"] = 0
    for c_data in data.companies:
        old_id = c_data.pop("id", None)
        c_data.pop("created_at", None)
        c_data.pop("updated_at", None)
        try:
            c_data = _coerce_dates(Company, c_data)
            company = Company(user_id=current_user_id, **c_data)
            db.add(company)
            await db.flush()
            if old_id:
                company_id_map[old_id] = company.id
            imported["companies"] += 1
        except Exception as e:
            skipped["companies"] += 1
            errors.append(f"Company '{c_data.get('name', '?')}': {e}")

    # Map old project_id → new project_id
    project_id_map: dict[int, int] = {}

    # Ensure technologies exist
    tech_name_to_id: dict[str, int] = {}
    for t_data in data.technologies:
        name = t_data["name"]
        result = await db.execute(select(Technology).where(Technology.name == name))
        tech = result.scalar_one_or_none()
        if not tech:
            tech = Technology(name=name, category=t_data.get("category"))
            db.add(tech)
            await db.flush()
        tech_name_to_id[name] = tech.id

    # Import projects
    imported["projects"] = 0
    skipped["projects"] = 0
    for p_data in data.projects:
        old_id = p_data.pop("id", None)
        tech_names = p_data.pop("_technology_names", [])
        p_data.pop("created_at", None)
        p_data.pop("updated_at", None)

        # Remap company_id
        old_company_id = p_data.pop("company_id", None)
        if old_company_id and old_company_id in company_id_map:
            p_data["company_id"] = company_id_map[old_company_id]
        else:
            p_data["company_id"] = None

        try:
            p_data = _coerce_dates(Project, p_data)
            project = Project(user_id=current_user_id, **p_data)
            db.add(project)
            await db.flush()
            if old_id:
                project_id_map[old_id] = project.id

            # Link technologies
            for t_info in tech_names:
                t_id = tech_name_to_id.get(t_info["name"])
                if t_id:
                    pt = ProjectTechnology(
                        project_id=project.id,
                        technology_id=t_id,
                        is_primary=t_info.get("is_primary", 0),
                    )
                    db.add(pt)

            imported["projects"] += 1
        except Exception as e:
            skipped["projects"] += 1
            errors.append(f"Project '{p_data.get('name', '?')}': {e}")

    # Import achievements
    imported["achievements"] = 0
    skipped["achievements"] = 0
    for a_data in data.achievements:
        a_data.pop("id", None)
        a_data.pop("created_at", None)
        a_data.pop("updated_at", None)
        old_project_id = a_data.pop("project_id", None)
        if old_project_id and old_project_id in project_id_map:
            a_data["project_id"] = project_id_map[old_project_id]
        else:
            skipped["achievements"] += 1
            continue
        try:
            a_data = _coerce_dates(ProjectAchievement, a_data)
            achievement = ProjectAchievement(**a_data)
            db.add(achievement)
            imported["achievements"] += 1
        except Exception as e:
            skipped["achievements"] += 1
            errors.append(f"Achievement: {e}")

    # Import credentials
    for cred_type, model_cls, cred_list in [
        ("certifications", Certification, data.certifications),
        ("awards", Award, data.awards),
        ("educations", Education, data.educations),
        ("publications", Publication, data.publications),
        ("volunteer_activities", VolunteerActivity, data.volunteer_activities),
    ]:
        imported[cred_type] = 0
        skipped[cred_type] = 0
        for c_data in cred_list:
            c_data.pop("id", None)
            c_data.pop("created_at", None)
            c_data.pop("updated_at", None)
            try:
                c_data = _coerce_dates(model_cls, c_data)
                obj = model_cls(user_id=current_user_id, **c_data)
                db.add(obj)
                imported[cred_type] += 1
            except Exception as e:
                skipped[cred_type] += 1
                errors.append(f"{cred_type}: {e}")

    await db.flush()

    return DataImportResponse(
        success=len(errors) == 0,
        imported_counts=imported,
        skipped_counts=skipped,
        errors=errors,
    )
