from collections import defaultdict, deque
import functools
import hmac
import threading
import time
from flask import g, session, jsonify, request
from . import admin_store
import config

# Who is using the panel: the owner of the service sees and manages everything,
# a user only the folders given to them. folders is None for the owner
OWNER = {"id": None, "name": "Владелец", "is_owner": True, "folders": None}

# Wrong passwords allowed per address, then it waits. Each attempt also costs
# the server a hash calculation, so guessing shouldn't get to run freely
MAX_FAILED_LOGINS = 10
FAILED_LOGIN_WINDOW = 600

_failed_logins = defaultdict(deque)
_failed_logins_lock = threading.Lock()

# Railway's proxy puts the visitor's address in X-Real-IP
def _client_address() -> str:
    return request.headers.get("X-Real-IP") or request.remote_addr or ""

def login_blocked() -> bool:
    now = time.time()
    with _failed_logins_lock:
        failures = _failed_logins[_client_address()]
        while failures and failures[0] < now - FAILED_LOGIN_WINDOW:
            failures.popleft()
        return len(failures) >= MAX_FAILED_LOGINS

def record_failed_login():
    with _failed_logins_lock:
        _failed_logins[_client_address()].append(time.time())

def clear_failed_logins():
    with _failed_logins_lock:
        _failed_logins.pop(_client_address(), None)

def admin_enabled() -> bool:
    return bool(config.ADMIN_PASSWORD)

def _as_account(user: dict) -> dict:
    return {"id": user["id"], "name": user["name"], "is_owner": False, "folders": set(user["folders"])}

# The account a password belongs to, or None. The panel has no logins, only passwords
def check_password(password: str):
    if not admin_enabled() or not password:
        return None
    if hmac.compare_digest(password.encode(), config.ADMIN_PASSWORD.encode()):
        return OWNER

    user = admin_store.find_user_by_password(password)
    return _as_account(user) if user else None

# Remembers the account in the session cookie. A changed password ends the
# user's sessions, because the cookie holds a piece of the password's hash
def log_in(account: dict):
    session.clear()
    session.permanent = True
    if account["is_owner"]:
        session["admin"] = True
    else:
        session["user"] = account["id"]
        session["stamp"] = admin_store.find_user(account["id"])["password_hash"][:16]

# The logged in account, or None
def current_user():
    if not admin_enabled():
        return None
    if session.get("admin") is True:
        return OWNER

    user_id = session.get("user")
    user = admin_store.find_user(user_id) if user_id else None
    if user and hmac.compare_digest(session.get("stamp", ""), user["password_hash"][:16]):
        return _as_account(user)
    return None

def can_use_folder(account: dict, folder_id) -> bool:
    return account["is_owner"] or folder_id in account["folders"]

# Addresses without a folder belong to the owner
def can_see_address(account: dict, entry: dict) -> bool:
    return account["is_owner"] or entry.get("folder") in account["folders"]

def visible_folders(account: dict, state: dict) -> list:
    return [f for f in state["folders"] if can_use_folder(account, f["id"])]

def visible_addresses(account: dict, state: dict) -> list:
    return [e for e in state["addresses"] if can_see_address(account, e)]

# Telegram groups and API keys belong to whoever created them
def owns(account: dict, record: dict) -> bool:
    return account["is_owner"] or record.get("owner") == account["id"]

# Protects JSON routes: anyone not logged in gets 401. The account ends up in g.user
def panel_required(view):
    @functools.wraps(view)
    def wrapper(*args, **kwargs):
        g.user = current_user()
        if not g.user:
            return jsonify({"error": "Unauthorized"}), 401
        return view(*args, **kwargs)
    return wrapper

# Same, but users get 403: only the owner of the service may do this
def owner_required(view):
    @functools.wraps(view)
    @panel_required
    def wrapper(*args, **kwargs):
        if not g.user["is_owner"]:
            return jsonify({"error": "Доступно только владельцу"}), 403
        return view(*args, **kwargs)
    return wrapper
