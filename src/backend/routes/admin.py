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

# Watched addresses with their email counts, plus all emails sent to them, newest first
@bp.route('/api/feed')
@auth.admin_required
def feed():
    entries = admin_store.read_addresses()
    inbox = inbox_handler.read_inbox()

    addresses = []
    emails = []
    for entry in entries:
        received = inbox.get(entry['address'], [])
        addresses.append({**entry, "count": len(received)})
        emails.extend(received)

    addresses.sort(key=lambda a: a.get('added', 0), reverse=True)
    emails.sort(key=lambda e: e.get('Timestamp', 0), reverse=True)
    emails = emails[:FEED_LIMIT]

    for email in emails:
        email['Code'] = extract_code(email.get('Subject', ''), email.get('Body', ''))

    return jsonify({"addresses": addresses, "emails": emails}), 200

@bp.route('/api/addresses', methods=['POST'])
@auth.admin_required
def add_address():
    data = request.get_json(silent=True) or {}
    error = admin_store.add_address(str(data.get('address', '')), str(data.get('note', '')))
    if error:
        return jsonify({"error": error}), 400
    return jsonify({"status": "ok"}), 200

@bp.route('/api/addresses/<path:address>', methods=['DELETE'])
@auth.admin_required
def remove_address(address):
    if not admin_store.remove_address(address):
        return jsonify({"error": "Адреса нет в списке"}), 404
    return jsonify({"status": "ok"}), 200
