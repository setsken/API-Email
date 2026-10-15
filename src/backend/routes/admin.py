from flask import Blueprint, render_template, request, jsonify, session, redirect, url_for
import time
import config
from .. import inbox_handler, admin_store, auth
from ..code_extractor import extract_code

bp = Blueprint('admin', __name__, url_prefix='/admin')

# The feed only sends the newest emails so each poll stays small
FEED_LIMIT = 200

# The admin page, or the login form if not logged in
@bp.route('')
def index():
    if not auth.admin_enabled():
        return render_template('admin_login.html', enabled=False), 503

    if not auth.is_admin():
        return render_template('admin_login.html', enabled=True)

    return render_template('admin.html', domains=config.DOMAINS)

@bp.route('/login', methods=['POST'])
def login():
    if not auth.check_password(request.form.get('password', '')):
        time.sleep(1)  # slows down password guessing
        return render_template('admin_login.html', enabled=auth.admin_enabled(), error="Неверный пароль"), 401

    session.clear()
    session['admin'] = True
    session.permanent = True
    return redirect(url_for('admin.index'))

@bp.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return redirect(url_for('admin.index'))

# JSON body of a request, never None
def _json_body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}

# Folders, all watched addresses with their email counts, and the emails sent
# to them, newest first. ?folder= and ?address= narrow down the emails
@bp.route('/api/feed')
@auth.admin_required
def feed():
    folder = request.args.get('folder', '')
    only_address = request.args.get('address', '').strip().lower()

    state = admin_store.read_state()
    inbox = inbox_handler.read_inbox()

    addresses = []
    emails = []
    for entry in state['addresses']:
        received = inbox.get(entry['address'], [])
        addresses.append({**entry, "folder": entry.get('folder'), "count": len(received)})

        if folder and entry.get('folder') != folder:
            continue
        if only_address and entry['address'] != only_address:
            continue
        emails.extend(received)

    addresses.sort(key=lambda a: a.get('added', 0), reverse=True)
    emails.sort(key=lambda e: e.get('Timestamp', 0), reverse=True)
    emails = emails[:FEED_LIMIT]

    for email in emails:
        email['Key'] = inbox_handler.email_key(email)
        email['Code'] = extract_code(email.get('Subject', ''), email.get('Body', ''))

    return jsonify({"folders": state['folders'], "addresses": addresses, "emails": emails}), 200

@bp.route('/api/addresses', methods=['POST'])
@auth.admin_required
def add_address():
    data = _json_body()
    message, error = admin_store.add_address(str(data.get('address', '')), str(data.get('note', '')), data.get('folder') or None)
    if error:
        return jsonify({"error": error}), 400
    return jsonify({"status": "ok", "message": message}), 200

# Moves an address to another folder ({"folder": null} takes it out of folders)
@bp.route('/api/addresses/<path:address>', methods=['PATCH'])
@auth.admin_required
def move_address(address):
    error = admin_store.move_address(address, _json_body().get('folder') or None)
    if error:
        return jsonify({"error": error}), 400
    return jsonify({"status": "ok"}), 200

@bp.route('/api/addresses/<path:address>', methods=['DELETE'])
@auth.admin_required
def remove_address(address):
    if not admin_store.remove_address(address):
        return jsonify({"error": "Адреса нет в списке"}), 404
    return jsonify({"status": "ok"}), 200

@bp.route('/api/folders', methods=['POST'])
@auth.admin_required
def add_folder():
    folder, error = admin_store.add_folder(str(_json_body().get('name', '')))
    if error:
        return jsonify({"error": error}), 400
    return jsonify(folder), 200

@bp.route('/api/folders/<folder_id>', methods=['PATCH'])
@auth.admin_required
def rename_folder(folder_id):
    error = admin_store.rename_folder(folder_id, str(_json_body().get('name', '')))
    if error:
        return jsonify({"error": error}), 400
    return jsonify({"status": "ok"}), 200

@bp.route('/api/folders/<folder_id>', methods=['DELETE'])
@auth.admin_required
def delete_folder(folder_id):
    if not admin_store.delete_folder(folder_id):
        return jsonify({"error": "Папка не найдена"}), 404
    return jsonify({"status": "ok"}), 200

# Deletes one email for good, so it's gone from the public inbox too
@bp.route('/api/emails', methods=['DELETE'])
@auth.admin_required
def delete_email():
    data = _json_body()
    address = str(data.get('address', '')).strip().lower()

    # only emails of watched addresses can be deleted from here
    if not any(e['address'] == address for e in admin_store.read_state()['addresses']):
        return jsonify({"error": "Адреса нет в списке"}), 404

    if not inbox_handler.delete_email(address, str(data.get('key', ''))):
        return jsonify({"error": "Письмо не найдено"}), 404
    return jsonify({"status": "ok"}), 200
