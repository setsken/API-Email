import hashlib
import html
import itertools
import logging
import re
import secrets
import threading
import time
import requests
import config
from . import admin_store
from .code_extractor import extract_code, extract_link

logger = logging.getLogger(__name__)


LINK_CODE_TTL = 600          # a /link code from the admin panel works for 10 minutes
LINK_MAX_FAILURES = 5        # wrong /link codes a chat may send per LINK_CODE_TTL
PENDING_ADD_TTL = 3600       # folder buttons under an /add stay usable for an hour
AWAIT_ADDRESS_TTL = 300      # after a bare /add, the next message counts as the address for 5 minutes
LIST_LIMIT = 50              # addresses shown per folder in /list
MESSAGE_LIMIT = 4000         # Telegram allows 4096 characters per message
WEBHOOK_RETRY_DELAYS = [3, 10, 30, 60, 120, 300]  # seconds between webhook registration attempts
CONNECT_RETRY_DELAYS = [1, 3]  # seconds between attempts when Telegram can't be reached at all

# Text of the question the bot asks after a bare /add; replies to it are the address
ADD_PROMPT = "Какой адрес добавить? Ответьте на это сообщение адресом"

COMMANDS = [
    {"command": "add", "description": "Добавить адрес: /add имя@домен"},
    {"command": "remove", "description": "Убрать адрес: /remove имя@домен"},
    {"command": "list", "description": "Адреса в папках этой группы"},
    {"command": "help", "description": "Как пользоваться ботом"},
]

COMMAND_HELP = (
    "/add имя@домен — добавить адрес (бот спросит папку)\n"
    "/add имя@домен заметка — то же, с заметкой\n"
    "/remove имя@домен — убрать адрес\n"
    "/list — адреса этой группы"
)

NOT_LINKED = (
    "Эта группа не привязана к Maildrop.\n"
    "Получите код в админке (кнопка «Telegram» → «Привязать группу») и отправьте сюда: /link КОД"
)

NO_FOLDERS = "Этой группе пока не назначены папки. Отметьте их в админке, в разделе Telegram."

_lock = threading.Lock()
_link_codes = {}      # code -> expiry time
_link_failures = {}   # chat id -> (wrong attempts, time of the first one)
_pending_adds = {}    # token -> {"chat", "address", "note", "expires"}
_awaiting_address = {}  # (chat id, user id) -> expiry, after a bare /add
_bot = {"username": None, "id": None, "checked": 0, "webhook": None, "webhook_error": None,
        "last_update": None, "last_error": None}

def enabled() -> bool:
    return bool(config.TELEGRAM_BOT_TOKEN)

# Telegram sends it back in a header, so only Telegram can call our webhook
def webhook_secret() -> str:
    return hashlib.sha256(f"maildrop-telegram:{config.TELEGRAM_BOT_TOKEN}".encode()).hexdigest()[:32]

# Calls the Bot API. Returns (result, None) or (None, error description)
def _request(method: str, **params):
    for attempt in itertools.count():
        try:
            url = f"{config.TELEGRAM_API_URL}/bot{config.TELEGRAM_BOT_TOKEN}/{method}"
            resp = requests.post(url, json=params, timeout=15)
            data = resp.json()
            break
        except Exception as e:
            # the URL holds the token, keep it out of the logs
            error = f"{type(e).__name__}: {e}".replace(config.TELEGRAM_BOT_TOKEN, "***")

            # no connection was made, so retrying can't send a message twice
            # (unlike a timeout while waiting for the answer)
            if isinstance(e, requests.ConnectionError) and attempt < len(CONNECT_RETRY_DELAYS):
                logger.warning("Telegram %s: no connection, retrying: %s", method, error)
                time.sleep(CONNECT_RETRY_DELAYS[attempt])
                continue

            logger.warning("Telegram %s failed: %s", method, error)
            _bot["last_error"] = {"time": int(time.time()), "method": method, "error": error}
            return None, error

    if not data.get("ok"):
        error = data.get("description") or "Telegram error"
        logger.warning("Telegram %s error: %s", method, error)
        _bot["last_error"] = {"time": int(time.time()), "method": method, "error": error}
        return None, error

    return data.get("result"), None

def _call(method: str, **params):
    return _request(method, **params)[0]

def _send(chat_id: int, text: str, **params):
    return _call("sendMessage", chat_id=chat_id, text=text, parse_mode="HTML",
                 link_preview_options={"is_disabled": True}, **params)

def _esc(text) -> str:
    return html.escape(str(text or ""))

# Bot username and id. Cached, and asked from Telegram at most once a minute
def bot_info() -> dict:
    if _bot["username"] or not enabled() or time.time() - _bot["checked"] < 60:
        return _bot

    _bot["checked"] = time.time()
    me = _call("getMe")
    if me:
        _bot["username"] = me.get("username")
        _bot["id"] = me.get("id")
    return _bot

# Registers the webhook and the command menu, in the background so startup isn't slowed
def start():
    if not enabled():
        return
    if not config.PUBLIC_URL:
        logger.warning("Telegram bot: PUBLIC_URL / RAILWAY_PUBLIC_DOMAIN not set, webhook not registered")
        return

    def setup():
        # right after the container starts its network may not be up yet,
        # so keep retrying: quickly at first, then every few minutes
        for attempt in itertools.count():
            result, error = _request("setWebhook", url=f"{config.PUBLIC_URL}/telegram/webhook", secret_token=webhook_secret(),
                                     allowed_updates=["message", "callback_query"])
            if result:
                break

            delay = WEBHOOK_RETRY_DELAYS[min(attempt, len(WEBHOOK_RETRY_DELAYS) - 1)]
            _bot["webhook"] = False
            _bot["webhook_error"] = f"{error} (повтор через {delay} с)"
            logger.warning("Telegram webhook NOT registered, retrying in %ss: %s", delay, error)
            time.sleep(delay)

        _bot["webhook"] = True
        _bot["webhook_error"] = None
        logger.info("Telegram webhook registered")
        _call("setMyCommands", commands=COMMANDS)
        bot_info()

    threading.Thread(target=setup, daemon=True).start()

# Status for the admin panel
def status(state: dict) -> dict:
    info = bot_info()
    return {
        "configured": enabled(),
        "bot": info["username"],
        # None while registration is still running after a restart
        "webhook": info["webhook"] if config.PUBLIC_URL else False,
        "webhook_error": info["webhook_error"] if config.PUBLIC_URL else "не известен адрес сайта (RAILWAY_PUBLIC_DOMAIN или PUBLIC_URL)",
        "last_update": info["last_update"],
        "last_error": info["last_error"],
        "api_url": config.TELEGRAM_API_URL,
        "chats": state["telegram_chats"],
    }

# A one-time code the admin gives to a group: "/link 1234-5678"
def new_link_code() -> str:
    code = f"{secrets.randbelow(10**8):08d}"
    with _lock:
        now = time.time()
        for old, expires in list(_link_codes.items()):
            if expires < now:
                del _link_codes[old]
        _link_codes[code] = now + LINK_CODE_TTL
    return f"{code[:4]}-{code[4:]}"

def _use_link_code(chat_id: int, code: str) -> bool:
    code = re.sub(r"\D", "", code)
    with _lock:
        now = time.time()
        failures, since = _link_failures.get(chat_id, (0, now))
        if now - since > LINK_CODE_TTL:
            failures, since = 0, now
        if failures >= LINK_MAX_FAILURES:
            return False

        expires = _link_codes.pop(code, None)
        if expires and expires >= now:
            _link_failures.pop(chat_id, None)
            return True

        _link_failures[chat_id] = (failures + 1, since)
        return False

# Folders a linked chat may use, in the order they were created
def _chat_folders(chat: dict, state: dict) -> list:
    allowed = set(chat.get("folders", []))
    return [f for f in state["folders"] if f["id"] in allowed]

# ---------- incoming updates ----------

def handle_update(update: dict):
    _bot["last_update"] = int(time.time())

    if "callback_query" in update:
        _handle_button(update["callback_query"])
        return

    message = update.get("message")
    if not message:
        return

    chat = message["chat"]
    chat_id = chat["id"]

    # a group that became a supergroup gets a new id
    if message.get("migrate_to_chat_id"):
        admin_store.update_chat(chat_id, new_id=message["migrate_to_chat_id"])
        return

    if message.get("new_chat_title"):
        admin_store.update_chat(chat_id, title=message["new_chat_title"])
        return

    text = (message.get("text") or "").strip()
    if not text:
        return

    user_id = (message.get("from") or {}).get("id")
    reply_to = message.get("reply_to_message") or {}

    if text.startswith("/"):
        parts = text.split(maxsplit=1)
        command, _, target = parts[0].partition("@")
        args = parts[1] if len(parts) > 1 else ""
        # a command for another bot in the same group (when our name is known)
        me = (bot_info()["username"] or "").lower()
        if target and me and target.lower() != me:
            return
        command = command.lower()
    elif (reply_to.get("from") or {}).get("is_bot") and (reply_to.get("text") or "").startswith(ADD_PROMPT):
        # a reply to "which address to add?"
        command, args = "/add", text
    elif _take_awaiting_address(chat_id, user_id):
        # the next message after a bare /add, sent without "reply"
        command, args = "/add", text
    else:
        return

    linked = admin_store.find_chat(chat_id)

    if command == "/link":
        _cmd_link(chat, linked, args)
    elif command in ("/start", "/help"):
        _send(chat_id, _help_text(linked))
    elif command in ("/add", "/remove", "/list"):
        if not linked:
            _send(chat_id, NOT_LINKED)
        elif command == "/add":
            _cmd_add(message, linked, args, user_id)
        elif command == "/remove":
            _cmd_remove(linked, args)
        else:
            _cmd_list(linked)

# True (once) if this user sent a bare /add here a moment ago
def _take_awaiting_address(chat_id: int, user_id) -> bool:
    with _lock:
        expires = _awaiting_address.pop((chat_id, user_id), None)
    return expires is not None and expires >= time.time()

def _help_text(linked) -> str:
    if not linked:
        return NOT_LINKED

    folders = _chat_folders(linked, admin_store.read_state())
    names = ", ".join(_esc(f["name"]) for f in folders) if folders else "пока не назначены"
    return (
        "Бот присылает сюда коды и ссылки подтверждения из писем на адреса из папок этой группы.\n\n"
        f"{COMMAND_HELP}\n\n"
        f"Папки группы: {names}"
    )

def _cmd_link(chat: dict, linked, args: str):
    chat_id = chat["id"]
    if linked:
        _send(chat_id, "Эта группа уже привязана.")
        return

    if not _use_link_code(chat_id, args):
        _send(chat_id, "Код не подошёл или устарел. Получите новый в админке: кнопка «Telegram» → «Привязать группу».")
        return

    title = chat.get("title") or chat.get("username") or chat.get("first_name") or str(chat_id)
    admin_store.link_chat(chat_id, title)
    _send(chat_id, "✅ Группа привязана. Теперь отметьте в админке, какие папки ей доступны: "
                   "коды с адресов этих папок будут приходить сюда.\n\n" + COMMAND_HELP)

def _cmd_add(message: dict, chat: dict, args: str, user_id=None):
    chat_id = chat["id"]

    if not args.strip():
        # the address may come as a reply to this question or as the next message
        with _lock:
            _awaiting_address[(chat_id, user_id)] = time.time() + AWAIT_ADDRESS_TTL
        _call("sendMessage", chat_id=chat_id, text=ADD_PROMPT + ".",
              reply_parameters={"message_id": message["message_id"], "allow_sending_without_reply": True},
              reply_markup={"force_reply": True, "selective": True, "input_field_placeholder": "имя@домен"})
        return

    # the address is here, stop treating this user's next message as one
    with _lock:
        _awaiting_address.pop((chat_id, user_id), None)

    parts = args.split(maxsplit=1)
    address = parts[0].lower()
    note = parts[1].strip() if len(parts) > 1 else ""

    error = admin_store.validate_address(address)
    if error:
        _send(chat_id, "⚠️ " + _esc(error))
        return

    folders = _chat_folders(chat, admin_store.read_state())
    if not folders:
        _send(chat_id, NO_FOLDERS)
        return

    # only one folder: nothing to choose
    if len(folders) == 1:
        _send(chat_id, _add_to_folder(chat_id, address, note, folders[0]["id"]))
        return

    token = secrets.token_hex(4)
    with _lock:
        now = time.time()
        for old, pending in list(_pending_adds.items()):
            if pending["expires"] < now:
                del _pending_adds[old]
        _pending_adds[token] = {"chat": chat_id, "address": address, "note": note, "expires": now + PENDING_ADD_TTL}

    keyboard = [[{"text": f"📁 {f['name']}", "callback_data": f"add:{token}:{f['id']}"}] for f in folders]
    keyboard.append([{"text": "Отмена", "callback_data": f"cancel:{token}"}])
    _send(chat_id, f"В какую папку добавить <code>{_esc(address)}</code>?", reply_markup={"inline_keyboard": keyboard})

# Adds (or moves) an address into one of the chat's folders, returns the reply text
def _add_to_folder(chat_id: int, address: str, note: str, folder_id: str) -> str:
    state = admin_store.read_state()
    chat = admin_store.find_chat(chat_id, state)
    if not chat:
        return NOT_LINKED

    folder = next((f for f in _chat_folders(chat, state) if f["id"] == folder_id), None)
    if not folder:
        return "⚠️ Эта папка больше не доступна группе."

    moved, error = admin_store.add_address(address, note, folder_id, allowed_folders=set(chat["folders"]))
    if error:
        return "⚠️ " + _esc(error)
    if moved:
        return "✅ " + _esc(moved) + f": <code>{_esc(address)}</code>"
    return f"✅ <code>{_esc(address)}</code> добавлен в папку «{_esc(folder['name'])}». Коды с него будут приходить сюда."

def _handle_button(query: dict):
    _call("answerCallbackQuery", callback_query_id=query["id"])

    message = query.get("message") or {}
    chat_id = message.get("chat", {}).get("id")
    if not chat_id:
        return

    action, _, rest = (query.get("data") or "").partition(":")
    token, _, folder_id = rest.partition(":")
    with _lock:
        pending = _pending_adds.get(token)
        if pending and pending["chat"] == chat_id:
            del _pending_adds[token]
        else:
            pending = None

    if not pending or pending["expires"] < time.time():
        text = "Запрос устарел, отправьте /add ещё раз."
    elif action == "cancel":
        text = "Отменено."
    else:
        text = _add_to_folder(chat_id, pending["address"], pending["note"], folder_id)

    # editing without reply_markup also removes the buttons
    _call("editMessageText", chat_id=chat_id, message_id=message["message_id"], text=text,
          parse_mode="HTML", link_preview_options={"is_disabled": True})

def _cmd_remove(chat: dict, args: str):
    chat_id = chat["id"]
    address = args.split()[0].lower() if args.split() else ""
    if not address:
        _send(chat_id, "Укажите адрес: /remove имя@домен")
        return

    state = admin_store.read_state()
    entry = next((e for e in state["addresses"] if e["address"] == address), None)
    if not entry or entry.get("folder") not in chat.get("folders", []):
        _send(chat_id, "Адреса нет в папках этой группы.")
        return

    admin_store.remove_address(address)
    _send(chat_id, f"🗑 <code>{_esc(address)}</code> убран из списка, коды с него больше не придут.")

def _cmd_list(chat: dict):
    state = admin_store.read_state()
    folders = _chat_folders(chat, state)
    if not folders:
        _send(chat["id"], NO_FOLDERS)
        return

    lines = []
    for folder in folders:
        entries = [e for e in state["addresses"] if e.get("folder") == folder["id"]]
        lines.append(f"📁 <b>{_esc(folder['name'])}</b> ({len(entries)})")
        for entry in entries[:LIST_LIMIT]:
            note = f" — {_esc(entry['note'])}" if entry.get("note") else ""
            lines.append(f"• <code>{_esc(entry['address'])}</code>{note}")
        if len(entries) > LIST_LIMIT:
            lines.append(f"…и ещё {len(entries) - LIST_LIMIT}")
        lines.append("")

    # cut at a line break so no html tag is left half-open
    text = "\n".join(lines).strip()
    if len(text) > MESSAGE_LIMIT:
        text = text[:text.rfind("\n", 0, MESSAGE_LIMIT)] + "\n…"
    _send(chat["id"], text)

# ---------- outgoing notifications ----------

# Sends the code (or verification link) of a received email to the groups
# that have the folder of its address. Emails without either are skipped
def notify_email(email: dict):
    if not enabled():
        return

    state = admin_store.read_state()
    entry = next((e for e in state["addresses"] if e["address"] == email.get("To")), None)
    if not entry or not entry.get("folder"):
        return

    chats = [c for c in state["telegram_chats"] if entry["folder"] in c.get("folders", [])]
    if not chats:
        return

    code = extract_code(email.get("Subject", ""), email.get("Body", ""))
    link = None if code else extract_link(email.get("Body", ""))
    if not code and not link:
        return

    folder = next((f for f in state["folders"] if f["id"] == entry["folder"]), None)

    lines = [f"🔑 <code>{_esc(code)}</code>" if code else f'🔗 <a href="{html.escape(link, quote=True)}">Ссылка подтверждения</a>']
    recipient = f"📬 <code>{_esc(entry['address'])}</code>"
    if entry.get("note"):
        recipient += f" · {_esc(entry['note'])}"
    lines.append(recipient)
    if folder:
        lines.append(f"📁 {_esc(folder['name'])}")
    lines.append(f"✉️ {_esc(email.get('From'))}")
    if (email.get('Subject') or '').strip():
        lines.append(f"📝 {_esc(email.get('Subject'))}")

    for chat in chats:
        _send(chat["id"], "\n".join(lines))

# Test message from the admin panel. Returns an error description, or None
def send_test(chat_id: int):
    _, error = _request("sendMessage", chat_id=chat_id,
                        text="✅ Тестовое сообщение из админки Maildrop. Коды будут приходить сюда.")
    return error
