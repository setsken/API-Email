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

# Reads the admin data:
# {"folders": [{"id", "name", "created"}],
#  "addresses": [{"address", "note", "added", "folder"}],
#  "telegram_chats": [{"id", "title", "folders", "linked"}]}
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

# Adds an address to the list, optionally into a folder. An address that is
# already listed gets moved into that folder instead; with allowed_folders,
# only out of those folders (or out of no folder).
# Returns (message, error): message is set when the address was moved
def add_address(address: str, note: str = "", folder: str = None, allowed_folders=None):
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
            if current and allowed_folders is not None and current["id"] not in allowed_folders:
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

# Deletes a folder; its addresses stay in the list without a folder.
# Returns False if the folder was not there
def delete_folder(folder_id: str) -> bool:
    with _state_lock:
        state = read_state()
        if not _find_folder(state, folder_id):
            return False

        state["folders"] = [f for f in state["folders"] if f["id"] != folder_id]
        for entry in state["addresses"]:
            if entry.get("folder") == folder_id:
                entry["folder"] = None
        for chat in state["telegram_chats"]:
            chat["folders"] = [f for f in chat.get("folders", []) if f != folder_id]
        _write_state(state)

    return True

def find_chat(chat_id: int, state: dict = None):
    state = state or read_state()
    return next((c for c in state["telegram_chats"] if c["id"] == chat_id), None)

# Links a Telegram chat. Returns False if it was linked already
def link_chat(chat_id: int, title: str) -> bool:
    with _state_lock:
        state = read_state()
        if find_chat(chat_id, state):
            return False

        state["telegram_chats"].append({"id": chat_id, "title": title[:100], "folders": [], "linked": int(time.time())})
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
