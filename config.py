import os
import hashlib
from dotenv import load_dotenv

load_dotenv()

FLASK_HOST = os.getenv("FLASK_HOST", "0.0.0.0")
FLASK_PORT = int(os.getenv("FLASK_PORT", 5000))

# Folder for all stored data. On Railway this is the mounted volume, so the
# inbox and the admin address list survive redeploys and restarts
DATA_DIR = os.getenv("DATA_DIR") or os.getenv("RAILWAY_VOLUME_MOUNT_PATH") or "."
os.makedirs(DATA_DIR, exist_ok=True)

# Relative file names are placed inside DATA_DIR, absolute ones are used as is
INBOX_FILE_NAME = os.path.join(DATA_DIR, os.getenv("INBOX_FILE_NAME", "inbox.json"))
ADMIN_LIST_FILE = os.path.join(DATA_DIR, os.getenv("ADMIN_LIST_FILE", "admin_addresses.json"))
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
# Signing secret of the Resend webhook (whsec_...). When set, unsigned webhooks are rejected
RESEND_WEBHOOK_SECRET = os.getenv("RESEND_WEBHOOK_SECRET", "").strip()

# Admin panel (/admin). It stays disabled until a password is set
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")

# Signs the admin session cookie. Derived from the admin password by default,
# so changing the password logs everyone out
SECRET_KEY = os.getenv("SECRET_KEY") or hashlib.sha256(f"maildrop-session:{ADMIN_PASSWORD}".encode()).hexdigest()

# Telegram bot (optional): token from @BotFather. It sends codes to linked groups
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()

# Public address of the site, used to register the Telegram webhook.
# Railway provides RAILWAY_PUBLIC_DOMAIN, PUBLIC_URL overrides it
_public_domain = os.getenv("RAILWAY_PUBLIC_DOMAIN", "").strip()
PUBLIC_URL = (os.getenv("PUBLIC_URL") or (f"https://{_public_domain}" if _public_domain else "")).rstrip("/")