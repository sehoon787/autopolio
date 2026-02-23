"""Attachment Service for managing credential file uploads."""

import os
import uuid
import aiofiles
from pathlib import Path
from fastapi import UploadFile, HTTPException
from typing import Tuple

# Base directory for attachments
ATTACHMENTS_DIR = Path("data/attachments")


class AttachmentService:
    """Service for handling file attachments for credentials."""

    def __init__(self, base_dir: Path = ATTACHMENTS_DIR):
        self.base_dir = base_dir
        self._ensure_base_dir()

    def _ensure_base_dir(self):
        """Ensure the attachments directory exists."""
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _get_user_dir(self, credential_type: str, user_id: int) -> Path:
        """Get the directory path for a user's attachments."""
        user_dir = self.base_dir / str(user_id) / credential_type
        user_dir.mkdir(parents=True, exist_ok=True)
        return user_dir

    async def save_attachment(
        self, file: UploadFile, credential_type: str, user_id: int
    ) -> Tuple[str, str, int]:
        """
        Save an uploaded file and return (relative_path, original_name, file_size).

        Args:
            file: The uploaded file
            credential_type: Type of credential (certifications, awards, etc.)
            user_id: The user's ID

        Returns:
            Tuple of (relative_path, original_filename, file_size_bytes)
        """
        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")

        # Get file extension
        original_name = file.filename
        ext = Path(original_name).suffix.lower()

        # Validate extension (allow common document/image types)
        allowed_extensions = {
            ".pdf",
            ".jpg",
            ".jpeg",
            ".png",
            ".gif",
            ".doc",
            ".docx",
            ".webp",
        }
        if ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"File type not allowed. Allowed types: {', '.join(allowed_extensions)}",
            )

        # Generate unique filename
        unique_name = f"{uuid.uuid4().hex}{ext}"
        user_dir = self._get_user_dir(credential_type, user_id)
        file_path = user_dir / unique_name

        # Save file
        content = await file.read()
        file_size = len(content)

        # Validate file size (max 10MB)
        max_size = 10 * 1024 * 1024  # 10MB
        if file_size > max_size:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum size is {max_size // (1024 * 1024)}MB",
            )

        async with aiofiles.open(file_path, "wb") as f:
            await f.write(content)

        # Return relative path from base_dir
        relative_path = str(file_path.relative_to(self.base_dir.parent))

        return relative_path, original_name, file_size

    async def delete_attachment(self, relative_path: str) -> bool:
        """
        Delete an attachment file.

        Args:
            relative_path: The relative path stored in the database

        Returns:
            True if deleted, False if file didn't exist
        """
        if not relative_path:
            return False

        file_path = self.base_dir.parent / relative_path

        if file_path.exists() and file_path.is_file():
            os.remove(file_path)
            return True

        return False

    def get_full_path(self, relative_path: str) -> Path:
        """
        Get the full filesystem path for an attachment.

        Args:
            relative_path: The relative path stored in the database

        Returns:
            Full Path object
        """
        return self.base_dir.parent / relative_path


# Singleton instance
attachment_service = AttachmentService()
