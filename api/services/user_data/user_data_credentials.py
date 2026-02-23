"""
User Data Credentials - Collect credentials (certifications, awards, education, etc.)
"""

from typing import Dict, Any, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.credentials import (
    Certification,
    Award,
    Education,
    Publication,
    VolunteerActivity,
)


async def collect_credentials(
    db: AsyncSession, user_id: int
) -> Dict[str, List[Dict[str, Any]]]:
    """Collect all credentials (certifications, awards, education, publications) for a user"""

    # Get certifications
    cert_result = await db.execute(
        select(Certification)
        .where(Certification.user_id == user_id)
        .order_by(Certification.display_order, Certification.issue_date.desc())
    )
    certifications = []
    for cert in cert_result.scalars().all():
        certifications.append(
            {
                "name": cert.name,
                "issuer": cert.issuer or "",
                "issue_date": cert.issue_date.strftime("%Y.%m")
                if cert.issue_date
                else "",
                "expiry_date": cert.expiry_date.strftime("%Y.%m")
                if cert.expiry_date
                else "",
                "credential_id": cert.credential_id or "",
                "credential_url": cert.credential_url or "",
                "description": cert.description or "",
            }
        )

    # Get awards
    award_result = await db.execute(
        select(Award)
        .where(Award.user_id == user_id)
        .order_by(Award.display_order, Award.award_date.desc())
    )
    awards = []
    for award in award_result.scalars().all():
        awards.append(
            {
                "name": award.name,
                "issuer": award.issuer or "",
                "award_date": award.award_date.strftime("%Y.%m")
                if award.award_date
                else "",
                "description": award.description or "",
                "award_url": award.award_url or "",
            }
        )

    # Get educations
    edu_result = await db.execute(
        select(Education)
        .where(Education.user_id == user_id)
        .order_by(Education.display_order, Education.start_date.desc())
    )
    educations = []
    for edu in edu_result.scalars().all():
        # Format period
        start = edu.start_date.strftime("%Y.%m") if edu.start_date else ""
        if edu.is_current:
            period = f"{start} - 재학중" if start else "재학중"
        else:
            end = edu.end_date.strftime("%Y.%m") if edu.end_date else ""
            period = f"{start} - {end}" if start or end else ""

        educations.append(
            {
                "school_name": edu.school_name,
                "major": edu.major or "",
                "degree": edu.degree or "",
                "start_date": start,
                "end_date": edu.end_date.strftime("%Y.%m") if edu.end_date else "",
                "period": period,
                "is_current": edu.is_current == 1,
                "gpa": edu.gpa or "",
                "description": edu.description or "",
            }
        )

    # Get publications
    pub_result = await db.execute(
        select(Publication)
        .where(Publication.user_id == user_id)
        .order_by(Publication.display_order, Publication.publication_date.desc())
    )
    publications = []
    for pub in pub_result.scalars().all():
        # Handle publication_date which can be date object or string
        pub_date = ""
        if pub.publication_date:
            if hasattr(pub.publication_date, "strftime"):
                pub_date = pub.publication_date.strftime("%Y.%m")
            else:
                # Already a string
                pub_date = str(pub.publication_date)
        publications.append(
            {
                "title": pub.title,
                "authors": pub.authors or "",
                "publication_type": pub.publication_type or "",
                "publisher": pub.publisher or "",
                "publication_date": pub_date,
                "doi": pub.doi or "",
                "url": pub.url or "",
                "description": pub.description or "",
            }
        )

    # Get volunteer activities
    activity_result = await db.execute(
        select(VolunteerActivity)
        .where(VolunteerActivity.user_id == user_id)
        .order_by(VolunteerActivity.display_order, VolunteerActivity.start_date.desc())
    )
    volunteer_activities = []
    for activity in activity_result.scalars().all():
        # Format period
        start = activity.start_date.strftime("%Y.%m") if activity.start_date else ""
        if activity.is_current:
            period = f"{start} - 진행중" if start else "진행중"
        else:
            end = activity.end_date.strftime("%Y.%m") if activity.end_date else ""
            period = f"{start} - {end}" if start or end else ""

        volunteer_activities.append(
            {
                "name": activity.name,
                "organization": activity.organization or "",
                "activity_type": activity.activity_type or "",
                "is_volunteer": activity.activity_type == "volunteer",
                "is_external": activity.activity_type == "external",
                "start_date": start,
                "end_date": activity.end_date.strftime("%Y.%m")
                if activity.end_date
                else "",
                "period": period,
                "is_current": activity.is_current == 1,
                "hours": activity.hours or 0,
                "role": activity.role or "",
                "description": activity.description or "",
                "certificate_url": activity.certificate_url or "",
            }
        )

    return {
        "certifications": certifications,
        "awards": awards,
        "educations": educations,
        "publications": publications,
        "volunteer_activities": volunteer_activities,
    }
