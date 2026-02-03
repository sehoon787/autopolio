"""
Attachment Service - Handle file uploads for credentials
"""

import os
import uuid
import aiofiles
from pathlib import Path
from typing import Optional, Tuple
from fastapi import UploadFile, HTTPException

# Allowed file extensions and their MIME types
ALLOWED_EXTENSIONS = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.zip': 'application/zip',
}

# Maximum file size (10MB)
MAX_FILE_SIZE = 10 * 1024 * 1024


class AttachmentService:
    """Service for handling credential attachments"""

    def __init__(self, base_dir: str = "data/attachments"):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _get_storage_path(
        self,
        credential_type: str,
        user_id: int,
        filename: str
    ) -> Tuple[Path, str]:
        """Generate storage path for an attachment.

        Returns:
            Tuple of (full_path, relative_path)
        """
        # Create directory structure: data/attachments/{credential_type}/{user_id}/
        type_dir = self.base_dir / credential_type / str(user_id)
        type_dir.mkdir(parents=True, exist_ok=True)

        # Generate unique filename to avoid collisions
        ext = Path(filename).suffix.lower()
        unique_name = f"{uuid.uuid4().hex}{ext}"
        full_path = type_dir / unique_name

        # Relative path for storage in DB
        relative_path = f"{credential_type}/{user_id}/{unique_name}"

        return full_path, relative_path

    def _validate_file(self, file: UploadFile) -> str:
        """Validate uploaded file.

        Returns:
            File extension if valid

        Raises:
            HTTPException if validation fails
        """
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")

        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS.keys())}"
            )

        return ext

    async def save_attachment(
        self,
        file: UploadFile,
        credential_type: str,
        user_id: int
    ) -> Tuple[str, str, int]:
        """Save an attachment file.

        Args:
            file: The uploaded file
            credential_type: Type of credential (certifications, awards, etc.)
            user_id: User ID

        Returns:
            Tuple of (relative_path, original_filename, file_size)
        """
        # Validate file
        self._validate_file(file)

        # Check file size
        contents = await file.read()
        file_size = len(contents)

        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024 * 1024)}MB"
            )

        if file_size == 0:
            raise HTTPException(status_code=400, detail="Empty file not allowed")

        # Generate path and save
        full_path, relative_path = self._get_storage_path(
            credential_type, user_id, file.filename
        )

        async with aiofiles.open(full_path, 'wb') as f:
            await f.write(contents)

        return relative_path, file.filename, file_size

    async def delete_attachment(self, relative_path: Optional[str]) -> bool:
        """Delete an attachment file.

        Args:
            relative_path: Relative path stored in DB

        Returns:
            True if deleted, False if file didn't exist
        """
        if not relative_path:
            return False

        full_path = self.base_dir / relative_path

        if full_path.exists():
            os.remove(full_path)
            return True

        return False

    def get_full_path(self, relative_path: str) -> Path:
        """Get full filesystem path for a relative path.

        Args:
            relative_path: Relative path stored in DB

        Returns:
            Full Path object
        """
        return self.base_dir / relative_path

    def file_exists(self, relative_path: Optional[str]) -> bool:
        """Check if an attachment file exists.

        Args:
            relative_path: Relative path stored in DB

        Returns:
            True if exists, False otherwise
        """
        if not relative_path:
            return False
        return (self.base_dir / relative_path).exists()

    def get_content_type(self, filename: str) -> str:
        """Get MIME type for a file.

        Args:
            filename: Filename with extension

        Returns:
            MIME type string
        """
        ext = Path(filename).suffix.lower()
        return ALLOWED_EXTENSIONS.get(ext, 'application/octet-stream')


# Singleton instance
attachment_service = AttachmentService()
