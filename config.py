import os
from dotenv import load_dotenv

load_dotenv()

FLASK_HOST = os.getenv("FLASK_HOST", "0.0.0.0")
FLASK_PORT = int(os.getenv("FLASK_PORT", 5000))

INBOX_FILE_NAME = os.getenv("INBOX_FILE_NAME", "inbox.json")
MAX_INBOX_SIZE = int(os.getenv("MAX_INBOX_SIZE", 100000000))

PROTECTED_ADDRESSES = os.getenv("PROTECTED_ADDRESSES", "^admin.*")

PASSWORD = os.getenv("PASSWORD", "password")

DOMAIN = os.getenv("DOMAIN", "ofstats.pro")

# Multiple domains support: comma-separated list in env var
# Example: DOMAINS=ofstats.pro,mymail.xyz,tempbox.site
# If not set, falls back to single DOMAIN
_domains_str = os.getenv("DOMAINS", "").strip().strip('"').strip("'")
DOMAINS = [d.strip() for d in _domains_str.split(",") if d.strip()] if _domains_str else [DOMAIN]

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
RESEND_WEBHOOK_SECRET = os.getenv("RESEND_WEBHOOK_SECRET", "")