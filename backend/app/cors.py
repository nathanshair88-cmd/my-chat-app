import os
from urllib.parse import urlparse


DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://disco-alto.vercel.app",
)

VERCEL_ORIGIN_REGEX = r"https://.*\.vercel\.app"


def _split_origins(value: str | None) -> list[str]:
    if not value:
        return []
    return [origin.strip().rstrip("/") for origin in value.split(",") if origin.strip()]


def get_cors_origins(*env_names: str) -> list[str]:
    origins = list(DEFAULT_CORS_ORIGINS)
    for env_name in env_names:
        origins.extend(_split_origins(os.getenv(env_name)))
    return list(dict.fromkeys(origins))


def is_allowed_origin(origin: str | None, *env_names: str) -> bool:
    if not origin:
        return True

    normalized = origin.rstrip("/")
    if normalized in get_cors_origins(*env_names):
        return True

    parsed = urlparse(normalized)
    return parsed.scheme == "https" and (parsed.hostname or "").endswith(".vercel.app")
