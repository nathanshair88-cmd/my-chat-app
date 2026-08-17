import secrets
import string


PUBLIC_ID_LENGTH = 10
PUBLIC_ID_ALPHABET = string.ascii_uppercase + string.digits


def generate_public_id() -> str:
    return "".join(secrets.choice(PUBLIC_ID_ALPHABET) for _ in range(PUBLIC_ID_LENGTH))
