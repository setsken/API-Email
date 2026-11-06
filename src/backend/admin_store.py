import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time
import config

# Same reason as the inbox lock: every change is a read-modify-write
_state_lock = threading.Lock()

ADDRESS_RE = re.compile(r"^[a-z0-9._%+-]+@[a-z0-9.-]+$")
FOLDER_NAME_MAX = 40
USER_NAME_MAX = 40
KEY_NAME_MAX = 60
PASSWORD_MIN_LENGTH = 8
API_KEY_PREFIX = "mdk_"

# Reads the admin data:
# {"folders": [{"id", "name", "created"}],
#  "addresses": [{"address", "note", "added", "folder"}],
#  "telegram_chats": [{"id", "title", "folders", "linked", "owner"}],
#  "users": [{"id", "name", "password_hash", "folders", "created"}],
#  "api_keys": [{"id", "name", "key_hash", "preview", "folders", "owner", "created", "last_used"}],
#  "password_salt": "..."}
# "owner" is the id of the user it belongs to, None for the owner of the service
def read_state() -> dict:
    try:
        with open(config.ADMIN_LIST_FILE, "r", encoding="utf-8") as f:
            state = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        state = {}

    # The first version stored only the address list
    if isinstance(state, list):
        state = {"addresses": state}

    state.setdefault("folders", [])
    state.setdefault("addresses", [])
    state.setdefault("telegram_chats", [])
    state.setdefault("users", [])
    state.setdefault("api_keys", [])
    return state

def _write_state(state: dict):
    tmp_name = config.ADMIN_LIST_FILE + ".tmp"
    with open(tmp_name, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=4, ensure_ascii=False)
    os.replace(tmp_name, config.ADMIN_LIST_FILE)

def _find_folder(state: dict, folder_id: str):
    return next((f for f in state["folders"] if f["id"] == folder_id), None)

def _clean_folder_name(name: str) -> str:
    return " ".join(name.split())[:FOLDER_NAME_MAX]

def _name_taken(state: dict, name: str, except_id: str = None) -> bool:
    return any(f["name"].casefold() == name.casefold() and f["id"] != except_id for f in state["folders"])

# Checks that an address can be watched. Returns an error message, or None
def validate_address(address: str):
    if not ADDRESS_RE.match(address):
        return "Некорректный адрес"

    domain = address.split("@")[1]
    if domain not in config.DOMAINS:
        return f"Домен {domain} не обслуживается. Доступные: {', '.join(config.DOMAINS)}"

    return None

def find_address(address: str, state: dict = None):
    state = state or read_state()
    return next((e for e in state["addresses"] if e["address"] == address), None)

# Adds an address to the list, optionally into a folder. An address that is
# already listed gets moved into that folder instead. With allowed_folders it
# only moves out of those folders, and out of no folder only if take_unfoldered.
# Returns (message, error): message is set when the address was moved
def add_address(address: str, note: str = "", folder: str = None, allowed_folders=None, take_unfoldered: bool = True):
    address = address.strip().lower()
    note = note.strip()[:100]
    folder = folder or None

    error = validate_address(address)
    if error:
        return None, error

    with _state_lock:
        state = read_state()
        target = _find_folder(state, folder) if folder else None
        if folder and not target:
            return None, "Папка не найдена"

        existing = next((e for e in state["addresses"] if e["address"] == address), None)
        if existing:
            current = _find_folder(state, existing.get("folder")) if existing.get("folder") else None
            if not target:
                return None, "Адрес уже в списке" + (f" (папка «{current['name']}»)" if current else "")
            if current and current["id"] == target["id"]:
                return None, "Адрес уже в этой папке"
            if allowed_folders is not None:
                if current and current["id"] not in allowed_folders or not current and not take_unfoldered:
                    return None, "Адрес уже используется в другой папке"

            existing["folder"] = target["id"]
            if note:
                existing["note"] = note
            _write_state(state)
            return f"Адрес перенесён в папку «{target['name']}»" + (f" из «{current['name']}»" if current else ""), None

        state["addresses"].append({"address": address, "note": note, "added": int(time.time()), "folder": folder})
        _write_state(state)

    return None, None

# Removes an address from the list. Returns False if it was not there
def remove_address(address: str) -> bool:
    address = address.strip().lower()

    with _state_lock:
        state = read_state()
        remaining = [e for e in state["addresses"] if e["address"] != address]
        if len(remaining) == len(state["addresses"]):
            return False

        state["addresses"] = remaining
        _write_state(state)

    return True

# Moves an address into a folder, or out of all folders with None.
# Returns an error message, or None on success
def move_address(address: str, folder: str = None):
    address = address.strip().lower()
    folder = folder or None

    with _state_lock:
        state = read_state()
        entry = next((e for e in state["addresses"] if e["address"] == address), None)
        if not entry:
            return "Адреса нет в списке"
        if folder and not _find_folder(state, folder):
            return "Папка не найдена"

        entry["folder"] = folder
        _write_state(state)

    return None

# Changes the note of an address. Returns an error message, or None on success
def set_note(address: str, note: str):
    address = address.strip().lower()

    with _state_lock:
        state = read_state()
        entry = find_address(address, state)
        if not entry:
            return "Адреса нет в списке"

        entry["note"] = note.strip()[:100]
        _write_state(state)

    return None

# Creates a folder. Returns (folder, None) on success or (None, error message)
def add_folder(name: str):
    name = _clean_folder_name(name)
    if not name:
        return None, "Введите название папки"

    with _state_lock:
        state = read_state()
        if _name_taken(state, name):
            return None, "Папка с таким названием уже есть"

        folder = {"id": secrets.token_hex(4), "name": name, "created": int(time.time())}
        state["folders"].append(folder)
        _write_state(state)

    return folder, None

# Renames a folder. Returns an error message, or None on success
def rename_folder(folder_id: str, name: str):
    name = _clean_folder_name(name)
    if not name:
        return "Введите название папки"

    with _state_lock:
        state = read_state()
        folder = _find_folder(state, folder_id)
        if not folder:
            return "Папка не найдена"
        if _name_taken(state, name, except_id=folder_id):
            return "Папка с таким названием уже есть"

        folder["name"] = name
        _write_state(state)

    return None

# Deletes a folder; its addresses stay in the list without a folder, and
# nobody has access to it anymore. Returns False if the folder was not there
def delete_folder(folder_id: str) -> bool:
    with _state_lock:
        state = read_state()
        if not _find_folder(state, folder_id):
            return False

        state["folders"] = [f for f in state["folders"] if f["id"] != folder_id]
        for entry in state["addresses"]:
            if entry.get("folder") == folder_id:
                entry["folder"] = None
        for holder in state["telegram_chats"] + state["users"] + state["api_keys"]:
            holder["folders"] = [f for f in holder.get("folders", []) if f != folder_id]
        _write_state(state)

    return True

def find_chat(chat_id: int, state: dict = None):
    state = state or read_state()
    return next((c for c in state["telegram_chats"] if c["id"] == chat_id), None)

# Links a Telegram chat for a user (None for the owner of the service).
# Returns False if it was linked already
def link_chat(chat_id: int, title: str, owner: str = None) -> bool:
    with _state_lock:
        state = read_state()
        if find_chat(chat_id, state):
            return False

        state["telegram_chats"].append({"id": chat_id, "title": title[:100], "folders": [], "linked": int(time.time()), "owner": owner})
        _write_state(state)

    return True

# Unlinks a Telegram chat. Returns False if it was not linked
def unlink_chat(chat_id: int) -> bool:
    with _state_lock:
        state = read_state()
        remaining = [c for c in state["telegram_chats"] if c["id"] != chat_id]
        if len(remaining) == len(state["telegram_chats"]):
            return False

        state["telegram_chats"] = remaining
        _write_state(state)

    return True

# Sets which folders a chat gets codes for. Returns an error message, or None
def set_chat_folders(chat_id: int, folders) -> str:
    if not isinstance(folders, list) or not all(isinstance(f, str) for f in folders):
        return "Некорректный список папок"

    with _state_lock:
        state = read_state()
        chat = find_chat(chat_id, state)
        if not chat:
            return "Группа не привязана"
        if any(not _find_folder(state, f) for f in folders):
            return "Папка не найдена"

        chat["folders"] = list(dict.fromkeys(folders))
        _write_state(state)

    return None

# Keeps a linked chat up to date: a new title, or a new id when Telegram
# turns a group into a supergroup
def update_chat(chat_id: int, title: str = None, new_id: int = None):
    with _state_lock:
        state = read_state()
        chat = find_chat(chat_id, state)
        if not chat:
            return

        if title:
            chat["title"] = title[:100]
        if new_id:
            chat["id"] = new_id
        _write_state(state)

# ---------- panel users ----------

# Login is by password alone, so a password must always give the same hash:
# one random salt for the whole installation instead of one per user
def _password_hash(state: dict, password: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), state["password_salt"].encode(), 200_000).hex()

def _valid_folders(state: dict, folders) -> bool:
    return isinstance(folders, list) and all(isinstance(f, str) and _find_folder(state, f) for f in folders)

def _check_new_password(state: dict, password: str, except_id: str = None):
    if len(password) < PASSWORD_MIN_LENGTH:
        return f"Пароль должен быть не короче {PASSWORD_MIN_LENGTH} символов"

    # it would be impossible to tell who is logging in
    password_hash = _password_hash(state, password)
    taken = any(u["password_hash"] == password_hash and u["id"] != except_id for u in state["users"])
    if taken or hmac.compare_digest(password.encode(), config.ADMIN_PASSWORD.encode()):
        return "Этот пароль уже занят, задайте другой"

    return None

def _public_user(user: dict) -> dict:
    return {k: v for k, v in user.items() if k != "password_hash"}

def list_users() -> list:
    return [_public_user(u) for u in read_state()["users"]]

def find_user(user_id: str, state: dict = None):
    state = state or read_state()
    return next((u for u in state["users"] if u["id"] == user_id), None)

def find_user_by_password(password: str):
    state = read_state()
    if not state["users"] or "password_salt" not in state:
        return None

    password_hash = _password_hash(state, password)
    return next((u for u in state["users"] if hmac.compare_digest(u["password_hash"], password_hash)), None)

# Creates a user. Returns (user, None) on success or (None, error message)
def add_user(name: str, password: str, folders: list):
    name = " ".join(str(name).split())[:USER_NAME_MAX]
    if not name:
        return None, "Введите имя пользователя"

    with _state_lock:
        state = read_state()
        state.setdefault("password_salt", secrets.token_hex(16))

        if any(u["name"].casefold() == name.casefold() for u in state["users"]):
            return None, "Пользователь с таким именем уже есть"
        if not _valid_folders(state, folders):
            return None, "Папка не найдена"
        error = _check_new_password(state, password)
        if error:
            return None, error

        user = {"id": secrets.token_hex(4), "name": name, "password_hash": _password_hash(state, password),
                "folders": list(dict.fromkeys(folders)), "created": int(time.time())}
        state["users"].append(user)
        _write_state(state)

    return _public_user(user), None

# Changes a user; arguments left as None stay as they are. Folders taken away
# also leave the user's Telegram groups and API keys.
# Returns an error message, or None on success
def update_user(user_id: str, name: str = None, password: str = None, folders: list = None):
    with _state_lock:
        state = read_state()
        user = find_user(user_id, state)
        if not user:
            return "Пользователь не найден"

        if name is not None:
            name = " ".join(str(name).split())[:USER_NAME_MAX]
            if not name:
                return "Введите имя пользователя"
            if any(u["name"].casefold() == name.casefold() and u["id"] != user_id for u in state["users"]):
                return "Пользователь с таким именем уже есть"
            user["name"] = name

        if password is not None:
            error = _check_new_password(state, password, except_id=user_id)
            if error:
                return error
            user["password_hash"] = _password_hash(state, password)

        if folders is not None:
            if not _valid_folders(state, folders):
                return "Папка не найдена"

            removed = set(user["folders"]) - set(folders)
            user["folders"] = list(dict.fromkeys(folders))
            for holder in state["telegram_chats"] + state["api_keys"]:
                if holder.get("owner") == user_id:
                    holder["folders"] = [f for f in holder.get("folders", []) if f not in removed]

        _write_state(state)

    return None

# Deletes a user along with their Telegram groups and API keys.
# Returns False if the user was not there
def delete_user(user_id: str) -> bool:
    with _state_lock:
        state = read_state()
        if not find_user(user_id, state):
            return False

        state["users"] = [u for u in state["users"] if u["id"] != user_id]
        state["telegram_chats"] = [c for c in state["telegram_chats"] if c.get("owner") != user_id]
        state["api_keys"] = [k for k in state["api_keys"] if k.get("owner") != user_id]
        _write_state(state)

    return True

# ---------- API keys ----------

# Keys are long and random, so a plain hash is enough to not keep them readable
def _key_hash(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()

def _public_key(key: dict) -> dict:
    return {k: v for k, v in key.items() if k != "key_hash"}

def list_api_keys() -> list:
    return [_public_key(k) for k in read_state()["api_keys"]]

def find_api_key_by_id(key_id: str, state: dict = None):
    state = state or read_state()
    return next((k for k in state["api_keys"] if k["id"] == key_id), None)

# The key record for a secret key from a request, or None
def find_api_key(raw_key: str, state: dict = None):
    if not raw_key:
        return None

    state = state or read_state()
    key_hash = _key_hash(raw_key)
    return next((k for k in state["api_keys"] if hmac.compare_digest(k["key_hash"], key_hash)), None)

# Creates a key. Returns (key record with the secret key in "key", None) or
# (None, error message). The secret key can't be seen again after this
def add_api_key(name: str, folders: list, owner: str = None):
    name = " ".join(str(name).split())[:KEY_NAME_MAX]
    if not name:
        return None, "Введите название ключа"

    raw_key = API_KEY_PREFIX + secrets.token_urlsafe(32)

    with _state_lock:
        state = read_state()
        if not folders:
            return None, "Выберите хотя бы одну папку"
        if not _valid_folders(state, folders):
            return None, "Папка не найдена"

        key = {"id": secrets.token_hex(4), "name": name, "key_hash": _key_hash(raw_key),
               "preview": f"{raw_key[:8]}…{raw_key[-4:]}", "folders": list(dict.fromkeys(folders)),
               "owner": owner, "created": int(time.time()), "last_used": None}
        state["api_keys"].append(key)
        _write_state(state)

    return {**_public_key(key), "key": raw_key}, None

# Changes a key; arguments left as None stay as they are.
# Returns an error message, or None on success
def update_api_key(key_id: str, name: str = None, folders: list = None):
    with _state_lock:
        state = read_state()
        key = find_api_key_by_id(key_id, state)
        if not key:
            return "Ключ не найден"

        if name is not None:
            name = " ".join(str(name).split())[:KEY_NAME_MAX]
            if not name:
                return "Введите название ключа"
            key["name"] = name

        if folders is not None:
            if not folders:
                return "Выберите хотя бы одну папку"
            if not _valid_folders(state, folders):
                return "Папка не найдена"
            key["folders"] = list(dict.fromkeys(folders))

        _write_state(state)

    return None

def delete_api_key(key_id: str) -> bool:
    with _state_lock:
        state = read_state()
        remaining = [k for k in state["api_keys"] if k["id"] != key_id]
        if len(remaining) == len(state["api_keys"]):
            return False

        state["api_keys"] = remaining
        _write_state(state)

    return True

# Remembers when a key was used, at most once a minute: it's asked on every API call
def touch_api_key(key_id: str):
    now = int(time.time())

    with _state_lock:
        state = read_state()
        key = find_api_key_by_id(key_id, state)
        if key and now - (key.get("last_used") or 0) >= 60:
            key["last_used"] = now
            _write_state(state)
