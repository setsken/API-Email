from flask import Blueprint, g, jsonify, request
from collections import defaultdict, deque
from datetime import datetime, timezone
import threading
import time
from .. import inbox_handler, admin_store

# The read-only API for external programs: each key sees only the emails of its
# folders. Documented for its users on the /api/docs page and in docs/API.md
bp = Blueprint('public_api', __name__, url_prefix='/api/v1')

DEFAULT_LIMIT = 20
MAX_LIMIT = 100

# Requests per key per minute, so one looping program can't slow down everything else
RATE_LIMIT = 600

_hits = defaultdict(deque)
_hits_lock = threading.Lock()

def _error(code: str, message: str, status: int):
    return jsonify({"error": code, "message": message}), status

def _too_many_requests(key_id: str) -> bool:
    now = time.time()
    with _hits_lock:
        hits = _hits[key_id]
        while hits and hits[0] < now - 60:
            hits.popleft()
        if len(hits) >= RATE_LIMIT:
            return True
        hits.append(now)
    return False

def _secret_key_from_request() -> str:
    header = request.headers.get('Authorization', '')
    if header.lower().startswith('bearer '):
        return header[7:].strip()
    return request.headers.get('X-API-Key', '').strip()

# Every request needs a valid key. What the key may see ends up in g
@bp.before_request
def authenticate():
    state = admin_store.read_state()
    key = admin_store.find_api_key(_secret_key_from_request(), state)
    if not key:
        return _error("invalid_api_key", "Нет ключа или ключ неверный", 401)

    if _too_many_requests(key["id"]):
        response, status = _error("rate_limited", f"Не больше {RATE_LIMIT} запросов в минуту на ключ", 429)
        response.headers["Retry-After"] = "60"
        return response, status

    # a user's key can never reach beyond the folders the user has right now
    allowed = set(key["folders"])
    if key.get("owner"):
        user = admin_store.find_user(key["owner"], state)
        allowed &= set(user["folders"]) if user else set()

    if time.time() - (key.get("last_used") or 0) >= 60:
        admin_store.touch_api_key(key["id"])

    g.folders = {folder["id"]: folder for folder in state["folders"] if folder["id"] in allowed}
    g.addresses = {entry["address"]: entry for entry in state["addresses"] if entry.get("folder") in g.folders}

def _folder_of(entry: dict) -> dict:
    folder = g.folders[entry["folder"]]
    return {"id": folder["id"], "name": folder["name"]}

def _message(email: dict) -> dict:
    entry = g.addresses[email["To"]]
    received = email["Timestamp"]
    return {
        "id": email["Id"],
        "address": email["To"],
        "note": entry.get("note") or "",
        "folder": _folder_of(entry),
        "code": email["Code"],
        "link": email["Link"],
        "from": email["From"],
        "subject": email["Subject"],
        "received_at": received,
        "received_at_iso": datetime.fromtimestamp(received, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

def _int_arg(name: str, default=None):
    value = request.args.get(name)
    if value is None or value == "":
        return default
    return int(value)  # a bad value is answered in the route

@bp.route('/folders')
def folders():
    counts = {folder_id: 0 for folder_id in g.folders}
    for entry in g.addresses.values():
        counts[entry["folder"]] += 1

    return jsonify({
        "folders": [{"id": f["id"], "name": f["name"], "addresses": counts[f["id"]]} for f in g.folders.values()],
        "server_time": int(time.time()),
    }), 200

@bp.route('/addresses')
def addresses():
    folder = request.args.get('folder')
    if folder and folder not in g.folders:
        return _error("folder_not_found", "Нет такой папки среди папок ключа", 404)

    entries = [e for e in g.addresses.values() if not folder or e["folder"] == folder]
    return jsonify({
        "addresses": [{"address": e["address"], "note": e.get("note") or "", "folder": _folder_of(e)} for e in entries],
        "server_time": int(time.time()),
    }), 200

# The newest emails with a code or a link, newest first. ?address= or ?folder=
# narrow them down, ?since= keeps those received at that time or later
@bp.route('/messages')
def messages():
    try:
        since = _int_arg('since')
        limit = _int_arg('limit', DEFAULT_LIMIT)
    except ValueError:
        return _error("bad_request", "since и limit должны быть целыми числами", 400)
    if not 1 <= limit <= MAX_LIMIT:
        return _error("bad_request", f"limit должен быть от 1 до {MAX_LIMIT}", 400)

    wanted = list(g.addresses)

    folder = request.args.get('folder')
    if folder:
        if folder not in g.folders:
            return _error("folder_not_found", "Нет такой папки среди папок ключа", 404)
        wanted = [a for a in wanted if g.addresses[a]["folder"] == folder]

    address = request.args.get('address', '').strip().lower()
    if address:
        if address not in wanted:
            return _error("address_not_found", "Нет такого адреса в папках ключа", 404)
        wanted = [address]

    emails = inbox_handler.list_emails(wanted, limit, only_useful=True, since=since)

    return jsonify({"messages": [_message(e) for e in emails], "server_time": int(time.time())}), 200

# One email with its html body, for when a program needs more than the code
@bp.route('/messages/<message_id>')
def message(message_id):
    email = inbox_handler.get_email(message_id)
    if not email or email["To"] not in g.addresses:
        return _error("message_not_found", "Нет такого письма в папках ключа", 404)

    return jsonify({**_message(email), "body": email["Body"], "server_time": int(time.time())}), 200
