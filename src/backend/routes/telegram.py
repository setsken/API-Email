from flask import Blueprint, request, jsonify
import hmac
import logging
import threading
from .. import telegram_bot

bp = Blueprint('telegram', __name__)
logger = logging.getLogger(__name__)

# Telegram posts bot updates (commands, button presses) here.
# The webhook is registered by telegram_bot.start() with a secret token
@bp.route('/telegram/webhook', methods=['POST'])
def webhook():
    if not telegram_bot.enabled():
        return jsonify({"error": "Telegram bot is not configured"}), 404

    secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token', '')
    if not hmac.compare_digest(secret, telegram_bot.webhook_secret()):
        return jsonify({"error": "Invalid secret"}), 401

    # answer right away, replies to Telegram are sent from a background thread
    update = request.get_json(silent=True)
    if isinstance(update, dict):
        threading.Thread(target=_run_update, args=(update,), daemon=True).start()
    return jsonify({"ok": True}), 200

def _run_update(update):
    try:
        telegram_bot.handle_update(update)
    except Exception:
        logger.exception("Telegram update failed")
