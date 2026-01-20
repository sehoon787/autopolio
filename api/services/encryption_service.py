from cryptography.fernet import Fernet
from api.config import get_settings
import base64
import hashlib

settings = get_settings()


class EncryptionService:
    """Service for encrypting and decrypting sensitive data."""

    def __init__(self):
        # Derive a key from the secret key
        key = hashlib.sha256(settings.secret_key.encode()).digest()
        self.fernet = Fernet(base64.urlsafe_b64encode(key))

    def encrypt(self, data: str) -> str:
        """Encrypt a string."""
        return self.fernet.encrypt(data.encode()).decode()

    def decrypt(self, encrypted_data: str) -> str:
        """Decrypt a string."""
        return self.fernet.decrypt(encrypted_data.encode()).decode()
