from flask import Blueprint, render_template, request, jsonify
from .. import inbox_handler
import config
import json
import re
import random
import string
import time
import urllib.request

bp = Blueprint('api', __name__)

# Store last webhook payload for debugging
_last_webhook_payload = {}

def fetch_email_content(email_id):
    """Fetch full email content from Resend API by email_id"""
    try:
        url = f"https://api.resend.com/emails/{email_id}"
        req = urllib.request.Request(url)
        req.add_header("Authorization", f"Bearer {config.RESEND_API_KEY}")
        req.add_header("Content-Type", "application/json")
        
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            return data
    except Exception as e:
        print(f"Error fetching email {email_id}: {e}")
        return None

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

        # Log the full payload for debugging
        global _last_webhook_payload
        _last_webhook_payload = payload
        print(f"Webhook received: {json.dumps(payload, indent=2, default=str)[:2000]}")

        event_type = payload.get('type', '')

        # Handle email.received event
        if event_type == 'email.received':
            data = payload.get('data', {})

            from_addr = data.get('from', 'unknown@unknown.com')
            to_list = data.get('to', [])
            subject = data.get('subject', 'No Subject')
            email_id = data.get('email_id', '')

            # Fetch full email content from Resend API
            body = ''
            content_type = 'HTML'
            
            if email_id:
                full_email = fetch_email_content(email_id)
                if full_email:
                    html_body = full_email.get('html', '') or ''
                    text_body = full_email.get('text', '') or full_email.get('body', '') or ''
                    
                    if html_body:
                        body = html_body
                    elif text_body:
                        body = f'<pre style="font-family:sans-serif;white-space:pre-wrap;word-wrap:break-word;">{text_body}</pre>'
            
            if not body:
                body = '<p style="color:#999;">Could not load email content</p>'

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
                print(f"Email saved: {from_addr} -> {to_addr}, body length: {len(body)}")

            return jsonify({"status": "ok"}), 200

        return jsonify({"status": "ignored"}), 200

    except Exception as e:
        print(f"Webhook error: {e}")
        return jsonify({"error": str(e)}), 500

# Debug: view raw webhook log
@bp.route('/debug/last_webhook')
def debug_last_webhook():
    return jsonify(_last_webhook_payload)