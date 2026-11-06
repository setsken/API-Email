from flask import Blueprint, g, render_template, request, jsonify, session, redirect, url_for
import secrets
import time
import config
from .. import inbox_handler, admin_store, auth, telegram_bot

bp = Blueprint('admin', __name__, url_prefix='/admin')

# The feed only sends the newest emails so each poll stays small
FEED_LIMIT = 200

# The admin page, or the login form if not logged in
@bp.route('')
def index():
    if not auth.admin_enabled():
        return render_template('admin_login.html', enabled=False), 503

    account = auth.current_user()
    if not account:
        return render_template('admin_login.html', enabled=True)

    boot = {"me": {"name": account["name"], "is_owner": account["is_owner"]}, "domains": config.DOMAINS}
    return render_template('admin.html', boot=boot)

@bp.route('/login', methods=['POST'])
def login():
    if auth.login_blocked():
        return render_template('admin_login.html', enabled=auth.admin_enabled(), error="Слишком много неудачных попыток. Попробуйте через несколько минут."), 429

    account = auth.check_password(request.form.get('password', ''))
    if not account:
        auth.record_failed_login()
        time.sleep(1)  # slows down password guessing
        return render_template('admin_login.html', enabled=auth.admin_enabled(), error="Неверный пароль"), 401

    auth.clear_failed_logins()
    auth.log_in(account)
    return redirect(url_for('admin.index'))

@bp.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return redirect(url_for('admin.index'))

# JSON body of a request, never None
def _json_body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}

# The list entry of an address, if this account may touch it
def _visible_entry(address: str, state: dict = None):
    entry = admin_store.find_address(address.strip().lower(), state)
    return entry if entry and auth.can_see_address(g.user, entry) else None

# Folders, addresses with their email counts and the emails sent to them, newest
# first; all of it limited to what this account may see. ?folder= and ?address=
# narrow down the emails, ?useful=1 keeps only those with a code or a link,
# ?telegram=1 adds the Telegram groups (only asked while that drawer is open)
@bp.route('/api/feed')
@auth.panel_required
def feed():
    folder = request.args.get('folder', '')
    only_address = request.args.get('address', '').strip().lower()

    state = admin_store.read_state()
    entries = auth.visible_addresses(g.user, state)
    counts = inbox_handler.count_emails([entry['address'] for entry in entries])

    addresses = []
    shown = []
    for entry in entries:
        addresses.append({**entry, "folder": entry.get('folder'), "count": counts.get(entry['address'], 0)})

        if folder and entry.get('folder') != folder:
            continue
        if only_address and entry['address'] != only_address:
            continue
        shown.append(entry['address'])

    addresses.sort(key=lambda a: a.get('added', 0), reverse=True)

    # without bodies: the page asks for a body when an email is opened
    emails = inbox_handler.list_emails(shown, FEED_LIMIT, only_useful=request.args.get('useful') == '1')

    response = {"folders": auth.visible_folders(g.user, state), "addresses": addresses, "emails": emails}
    if request.args.get('telegram') == '1':
        response["telegram"] = {
            **telegram_bot.status(state, g.user["is_owner"]),
            "chats": [{**chat, "folders": _visible_folder_ids(chat)} for chat in state['telegram_chats'] if auth.owns(g.user, chat)],
        }
    return jsonify(response), 200

# The folders of a group or a key that this account may see
def _visible_folder_ids(record: dict) -> list:
    return [f for f in record.get('folders', []) if auth.can_use_folder(g.user, f)]

@bp.route('/api/addresses', methods=['POST'])
@auth.panel_required
def add_address():
    data = _json_body()
    folder = data.get('folder') or None

    if g.user["is_owner"]:
        message, error = admin_store.add_address(str(data.get('address', '')), str(data.get('note', '')), folder)
    else:
        # a user's address always goes into one of their folders
        if not folder and len(g.user["folders"]) == 1:
            folder = next(iter(g.user["folders"]))
        if not auth.can_use_folder(g.user, folder):
            return jsonify({"error": "Выберите свою папку"}), 400

        message, error = admin_store.add_address(str(data.get('address', '')), str(data.get('note', '')), folder,
                                                 allowed_folders=g.user["folders"], take_unfoldered=False)
    if error:
        return jsonify({"error": error}), 400
    return jsonify({"status": "ok", "message": message}), 200

# Changes an address: {"folder": id} moves it ({"folder": null} takes it out of
# folders, for the owner only), {"note": text} changes its note
@bp.route('/api/addresses/<path:address>', methods=['PATCH'])
@auth.panel_required
def update_address(address):
    if not _visible_entry(address):
        return jsonify({"error": "Адреса нет в списке"}), 404

    data = _json_body()

    if 'folder' in data:
        folder = data['folder'] or None
        if not g.user["is_owner"] and not auth.can_use_folder(g.user, folder):
            return jsonify({"error": "Выберите свою папку"}), 400

        error = admin_store.move_address(address, folder)
        if error:
            return jsonify({"error": error}), 400

    if 'note' in data:
        error = admin_store.set_note(address, str(data['note']))
        if error:
            return jsonify({"error": error}), 400

    return jsonify({"status": "ok"}), 200

@bp.route('/api/addresses/<path:address>', methods=['DELETE'])
@auth.panel_required
def remove_address(address):
    if not _visible_entry(address) or not admin_store.remove_address(address):
        return jsonify({"error": "Адреса нет в списке"}), 404
    return jsonify({"status": "ok"}), 200

@bp.route('/api/folders', methods=['POST'])
@auth.owner_required
def add_folder():
    folder, error = admin_store.add_folder(str(_json_body().get('name', '')))
    if error:
        return jsonify({"error": error}), 400
    return jsonify(folder), 200

@bp.route('/api/folders/<folder_id>', methods=['PATCH'])
@auth.owner_required
def rename_folder(folder_id):
    error = admin_store.rename_folder(folder_id, str(_json_body().get('name', '')))
    if error:
        return jsonify({"error": error}), 400
    return jsonify({"status": "ok"}), 200

@bp.route('/api/folders/<folder_id>', methods=['DELETE'])
@auth.owner_required
def delete_folder(folder_id):
    if not admin_store.delete_folder(folder_id):
        return jsonify({"error": "Папка не найдена"}), 404
    return jsonify({"status": "ok"}), 200

# The body of one email, requested when it's opened in the feed
@bp.route('/api/emails/<email_id>')
@auth.panel_required
def get_email(email_id):
    email = inbox_handler.get_email(email_id)
    if not email or not _visible_entry(email['To']):
        return jsonify({"error": "Письмо не найдено"}), 404
    return jsonify({"Body": email['Body']}), 200

# Deletes one email for good, so it's gone from the public inbox too
@bp.route('/api/emails', methods=['DELETE'])
@auth.panel_required
def delete_email():
    data = _json_body()
    address = str(data.get('address', '')).strip().lower()

    if not _visible_entry(address):
        return jsonify({"error": "Адреса нет в списке"}), 404

    if not inbox_handler.delete_email(address, str(data.get('id', ''))):
        return jsonify({"error": "Письмо не найдено"}), 404
    return jsonify({"status": "ok"}), 200

# ---------- Telegram ----------

# The group, if this account may manage it
def _own_chat(chat_id: int, state: dict = None):
    chat = admin_store.find_chat(chat_id, state)
    return chat if chat and auth.owns(g.user, chat) else None

# One-time code that links a Telegram group: the group sends "/link <code>" to the bot
@bp.route('/api/telegram/link-code', methods=['POST'])
@auth.panel_required
def telegram_link_code():
    if not telegram_bot.enabled():
        return jsonify({"error": "Бот не настроен: задайте TELEGRAM_BOT_TOKEN"}), 400

    code = telegram_bot.new_link_code(g.user["id"])
    return jsonify({
        "code": code,
        "bot": telegram_bot.bot_info()["username"],
        "expires_in": telegram_bot.LINK_CODE_TTL,
    }), 200

# Which folders a linked group gets codes for
@bp.route('/api/telegram/chats/<int(signed=True):chat_id>', methods=['PATCH'])
@auth.panel_required
def telegram_chat_folders(chat_id):
    chat = _own_chat(chat_id)
    if not chat:
        return jsonify({"error": "Группа не привязана"}), 404

    folders = _json_body().get('folders')
    if isinstance(folders, list):
        if not all(auth.can_use_folder(g.user, f) for f in folders):
            return jsonify({"error": "Папка не найдена"}), 400
        # folders the owner of the service added stay: the user neither sees nor changes them
        folders = folders + [f for f in chat.get('folders', []) if not auth.can_use_folder(g.user, f)]

    error = admin_store.set_chat_folders(chat_id, folders)
    if error:
        return jsonify({"error": error}), 400
    return jsonify({"status": "ok"}), 200

@bp.route('/api/telegram/chats/<int(signed=True):chat_id>', methods=['DELETE'])
@auth.panel_required
def telegram_unlink(chat_id):
    if not _own_chat(chat_id) or not admin_store.unlink_chat(chat_id):
        return jsonify({"error": "Группа не привязана"}), 404
    return jsonify({"status": "ok"}), 200

@bp.route('/api/telegram/chats/<int(signed=True):chat_id>/test', methods=['POST'])
@auth.panel_required
def telegram_test(chat_id):
    if not _own_chat(chat_id):
        return jsonify({"error": "Группа не привязана"}), 404

    error = telegram_bot.send_test(chat_id)
    if error:
        return jsonify({"error": f"Telegram не принял сообщение: {error}"}), 502
    return jsonify({"status": "ok"}), 200

# ---------- API keys ----------

# API keys of this account. The owner of the service sees everyone's
@bp.route('/api/keys')
@auth.panel_required
def list_keys():
    state = admin_store.read_state()
    users = {user['id']: user['name'] for user in state['users']}
    keys = [{**key, "folders": _visible_folder_ids(key), "owner_name": users.get(key.get('owner'))}
            for key in admin_store.list_api_keys() if auth.owns(g.user, key)]
    return jsonify({"keys": keys, "folders": auth.visible_folders(g.user, state)}), 200

# The answer holds the secret key, it can't be seen again later
@bp.route('/api/keys', methods=['POST'])
@auth.panel_required
def add_key():
    data = _json_body()
    folders = data.get('folders')
    if not isinstance(folders, list) or not all(auth.can_use_folder(g.user, f) for f in folders):
        return jsonify({"error": "Папка не найдена"}), 400

    key, error = admin_store.add_api_key(str(data.get('name', '')), folders, g.user["id"])
    if error:
        return jsonify({"error": error}), 400
    return jsonify(key), 200

@bp.route('/api/keys/<key_id>', methods=['PATCH'])
@auth.panel_required
def update_key(key_id):
    key = admin_store.find_api_key_by_id(key_id)
    if not key or not auth.owns(g.user, key):
        return jsonify({"error": "Ключ не найден"}), 404

    data = _json_body()
    folders = data.get('folders')
    if 'folders' in data and (not isinstance(folders, list) or not all(auth.can_use_folder(g.user, f) for f in folders)):
        return jsonify({"error": "Папка не найдена"}), 400

    error = admin_store.update_api_key(key_id, str(data['name']) if 'name' in data else None, folders)
    if error:
        return jsonify({"error": error}), 400
    return jsonify({"status": "ok"}), 200

@bp.route('/api/keys/<key_id>', methods=['DELETE'])
@auth.panel_required
def delete_key(key_id):
    key = admin_store.find_api_key_by_id(key_id)
    if not key or not auth.owns(g.user, key) or not admin_store.delete_api_key(key_id):
        return jsonify({"error": "Ключ не найден"}), 404
    return jsonify({"status": "ok"}), 200

# ---------- panel users (owner only) ----------

@bp.route('/api/users')
@auth.owner_required
def list_users():
    return jsonify({"users": admin_store.list_users(), "folders": admin_store.read_state()['folders']}), 200

# Without a password in the request one is generated. The answer holds the
# password, it can't be seen again later
@bp.route('/api/users', methods=['POST'])
@auth.owner_required
def add_user():
    data = _json_body()
    password = str(data.get('password') or secrets.token_urlsafe(12))

    user, error = admin_store.add_user(str(data.get('name', '')), password, data.get('folders') or [])
    if error:
        return jsonify({"error": error}), 400
    return jsonify({**user, "password": password}), 200

# Sending "password": "" generates a new password, the answer holds it
@bp.route('/api/users/<user_id>', methods=['PATCH'])
@auth.owner_required
def update_user(user_id):
    data = _json_body()
    password = None
    if 'password' in data:
        password = str(data['password'] or secrets.token_urlsafe(12))

    error = admin_store.update_user(user_id, data.get('name'), password, data.get('folders'))
    if error:
        return jsonify({"error": error}), 400

    response = {"status": "ok"}
    if password:
        response["password"] = password
    return jsonify(response), 200

@bp.route('/api/users/<user_id>', methods=['DELETE'])
@auth.owner_required
def delete_user(user_id):
    if not admin_store.delete_user(user_id):
        return jsonify({"error": "Пользователь не найден"}), 404
    return jsonify({"status": "ok"}), 200
