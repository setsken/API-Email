from flask import Blueprint, render_template, request, jsonify
from .. import inbox_handler
import config
import re
import random
import string
import time

bp = Blueprint('api', __name__)

# Make a random email containing 6 characters
@bp.route('/get_random_address')
def get_random_address():
    random_string = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return jsonify({"address": f"{random_string}@{config.DOMAIN}"}), 200

# Get an email domain
@bp.route('/get_domain')
def get_domain():
    return jsonify({"domain": config.DOMAIN}), 200

# This route returns the contents of an inbox
@bp.route('/get_inbox')
def get_inbox():
    addr = request.args.get("address", "").lower()
    password = request.headers.get("Authorization", None)

    if re.match(config.PROTECTED_ADDRESSES, addr) and password != config.PASSWORD:
        return jsonify({"error": "Unauthorized"}), 401

    inbox = inbox_handler.read_inbox()
    address_inbox = inbox.get(addr, [])
    return jsonify(address_inbox), 200

# Resend Inbound Webhook — receives emails from Resend
@bp.route('/webhook/resend', methods=['POST'])
def resend_webhook():
    try:
        payload = request.json

        if not payload:
            return jsonify({"error": "Empty payload"}), 400

        event_type = payload.get('type', '')

        # Handle email.received event
        if event_type == 'email.received':
            data = payload.get('data', {})

            from_addr = data.get('from', 'unknown@unknown.com')
            to_list = data.get('to', [])
            subject = data.get('subject', 'No Subject')
            text_body = data.get('text', '')
            html_body = data.get('html', '')

            # Use HTML body if available, otherwise text
            body = html_body if html_body else text_body
            content_type = 'HTML' if html_body else 'Text'

            current_timestamp = int(time.time())

            # Process each recipient
            for to_addr in to_list:
                to_addr = to_addr.lower().strip()

                if not to_addr.endswith(f'@{config.DOMAIN}'):
                    continue

                email_json = {
                    "From": from_addr,
                    "To": to_addr,
                    "Subject": subject,
                    "Timestamp": current_timestamp,
                    "Sent": time.strftime("%b %d at %H:%M:%S", time.gmtime(current_timestamp)),
                    "Body": body,
                    "ContentType": content_type
                }

                inbox_handler.recv_email(email_json)

            return jsonify({"status": "ok"}), 200

        return jsonify({"status": "ignored"}), 200

    except Exception as e:
        print(f"Webhook error: {e}")
        return jsonify({"error": str(e)}), 500