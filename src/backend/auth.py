import functools
import hmac
from flask import session, jsonify
import config

def admin_enabled() -> bool:
    return bool(config.ADMIN_PASSWORD)

def check_password(password: str) -> bool:
    return admin_enabled() and hmac.compare_digest(password.encode(), config.ADMIN_PASSWORD.encode())

def is_admin() -> bool:
    return admin_enabled() and session.get("admin") is True

# Protects JSON routes: anyone without an admin session gets 401
def admin_required(view):
    @functools.wraps(view)
    def wrapper(*args, **kwargs):
        if not is_admin():
            return jsonify({"error": "Unauthorized"}), 401
        return view(*args, **kwargs)
    return wrapper
