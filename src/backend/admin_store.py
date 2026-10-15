import json
import os
import re
import threading
import time
import config

# Same reason as the inbox lock: add/remove are read-modify-write
_list_lock = threading.Lock()

ADDRESS_RE = re.compile(r"^[a-z0-9._%+-]+@[a-z0-9.-]+$")

# Reads the watched address list: [{"address", "note", "added"}, ...]
def read_addresses() -> list:
    try:
        with open(config.ADMIN_LIST_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []

def _write_addresses(entries: list):
    tmp_name = config.ADMIN_LIST_FILE + ".tmp"
    with open(tmp_name, "w", encoding="utf-8") as f:
        json.dump(entries, f, indent=4, ensure_ascii=False)
    os.replace(tmp_name, config.ADMIN_LIST_FILE)

# Adds an address to the list. Returns an error message, or None on success
def add_address(address: str, note: str = ""):
    address = address.strip().lower()
    note = note.strip()[:100]

    if not ADDRESS_RE.match(address):
        return "Некорректный адрес"

    domain = address.split("@")[1]
    if domain not in config.DOMAINS:
        return f"Домен {domain} не обслуживается. Доступные: {', '.join(config.DOMAINS)}"

    with _list_lock:
        entries = read_addresses()
        if any(e["address"] == address for e in entries):
            return "Адрес уже в списке"

        entries.append({"address": address, "note": note, "added": int(time.time())})
        _write_addresses(entries)

    return None

# Removes an address from the list. Returns False if it was not there
def remove_address(address: str) -> bool:
    address = address.strip().lower()

    with _list_lock:
        entries = read_addresses()
        remaining = [e for e in entries if e["address"] != address]
        if len(remaining) == len(entries):
            return False

        _write_addresses(remaining)

    return True
