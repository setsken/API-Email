import contextlib
import json
import os
import sqlite3
import uuid
import config
from .code_extractor import extract_code, extract_link

# All emails live in one SQLite file, and a request only reads the rows it needs.
# They used to be in one JSON file that was loaded whole on every request and
# every new email, which kept gigabytes of memory allocated on the server.

# body stays the last column: SQLite then doesn't walk through it to read the others
_SCHEMA = (
    """CREATE TABLE IF NOT EXISTS emails (
        id TEXT PRIMARY KEY,
        recipient TEXT NOT NULL,
        sender TEXT,
        subject TEXT,
        timestamp INTEGER NOT NULL,
        sent TEXT,
        content_type TEXT,
        code TEXT,
        link TEXT,
        body TEXT
    )""",
    "CREATE INDEX IF NOT EXISTS emails_recipient ON emails (recipient, timestamp)",
    "CREATE INDEX IF NOT EXISTS emails_timestamp ON emails (timestamp)",
)

_SUMMARY_COLUMNS = "id, recipient, sender, subject, timestamp, sent, content_type, code, link"

# A short-lived connection per operation; SQLite takes care of concurrent threads
@contextlib.contextmanager
def _db():
    conn = sqlite3.connect(config.INBOX_DB_FILE, timeout=30)
    conn.row_factory = sqlite3.Row
    try:
        with conn:
            yield conn
    finally:
        conn.close()

def _create_tables(conn: sqlite3.Connection):
    for statement in _SCHEMA:
        conn.execute(statement)

# A database from before the link column is rebuilt, not ALTERed: a new column
# would land after the body and reading it would walk through every body.
# Rows are copied one at a time so a big table doesn't load into memory
def _add_link_column(conn: sqlite3.Connection):
    conn.execute("DROP INDEX IF EXISTS emails_recipient")
    conn.execute("DROP INDEX IF EXISTS emails_timestamp")
    conn.execute("ALTER TABLE emails RENAME TO emails_old")
    _create_tables(conn)

    for row in conn.execute("SELECT * FROM emails_old"):
        email = dict(row)
        email["link"] = extract_link(row["subject"], row["body"])
        conn.execute("INSERT INTO emails (id, recipient, sender, subject, timestamp, sent, content_type, code, link, body)"
                     " VALUES (:id, :recipient, :sender, :subject, :timestamp, :sent, :content_type, :code, :link, :body)", email)

    conn.execute("DROP TABLE emails_old")

with _db() as _conn:
    _conn.execute("BEGIN IMMEDIATE")
    _columns = [row["name"] for row in _conn.execute("PRAGMA table_info(emails)")]
    if _columns and "link" not in _columns:
        _add_link_column(_conn)
    else:
        _create_tables(_conn)

# A database row as the email dictionary the rest of the app and the API use
def _to_email(row: sqlite3.Row) -> dict:
    email = {
        "Id": row["id"],
        "From": row["sender"],
        "To": row["recipient"],
        "Subject": row["subject"],
        "Timestamp": row["timestamp"],
        "Sent": row["sent"],
        "ContentType": row["content_type"],
        "Code": row["code"],
        "Link": row["link"],
    }
    if "body" in row.keys():
        email["Body"] = row["body"]
    return email

def _insert(conn: sqlite3.Connection, email: dict):
    conn.execute(
        "INSERT OR IGNORE INTO emails (id, recipient, sender, subject, timestamp, sent, content_type, code, link, body)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (email["Id"], email["To"], email.get("From"), email.get("Subject"), email.get("Timestamp") or 0,
         email.get("Sent"), email.get("ContentType"), email.get("Code"), email.get("Link"), email.get("Body")),
    )

# Drops the oldest tenth of the emails once the data exceeds the maximum.
# Freed space in the file is reused, so the file stops growing at that size
def _trim(conn: sqlite3.Connection):
    page_size = conn.execute("PRAGMA page_size").fetchone()[0]
    pages = conn.execute("PRAGMA page_count").fetchone()[0]
    free = conn.execute("PRAGMA freelist_count").fetchone()[0]

    if (pages - free) * page_size > config.MAX_INBOX_SIZE:
        conn.execute("DELETE FROM emails WHERE id IN (SELECT id FROM emails ORDER BY timestamp"
                     " LIMIT (SELECT COUNT(*) / 10 + 1 FROM emails))")

# Adds a new email to the inbox
def recv_email(email_json: dict):
    if not email_json.get("To"):
        return

    # Lets the admin panel point at this exact email, e.g. to delete it
    email_json.setdefault("Id", uuid.uuid4().hex)
    email_json["Code"] = extract_code(email_json.get("Subject"), email_json.get("Body"))
    email_json["Link"] = extract_link(email_json.get("Subject"), email_json.get("Body"))

    with _db() as conn:
        _trim(conn)
        _insert(conn, email_json)

# All emails of one address with their bodies, oldest first
def get_inbox(address: str) -> list:
    with _db() as conn:
        rows = conn.execute("SELECT * FROM emails WHERE recipient = ? ORDER BY timestamp, rowid", (address,)).fetchall()
    return [_to_email(row) for row in rows]

# The newest emails of these addresses without their bodies, newest first.
# only_useful leaves out emails with neither a code nor a link, since keeps
# emails received at that unix time or later
def list_emails(addresses: list, limit: int, only_useful: bool = False, since: int = None) -> list:
    if not addresses:
        return []

    where = f"recipient IN ({','.join('?' * len(addresses))})"
    params = list(addresses)
    if only_useful:
        where += " AND (code IS NOT NULL OR link IS NOT NULL)"
    if since is not None:
        where += " AND timestamp >= ?"
        params.append(since)

    with _db() as conn:
        rows = conn.execute(f"SELECT {_SUMMARY_COLUMNS} FROM emails WHERE {where} ORDER BY timestamp DESC, rowid DESC LIMIT ?",
                            (*params, limit)).fetchall()
    return [_to_email(row) for row in rows]

# How many emails each address has: {address: count}, addresses without emails left out
def count_emails(addresses: list) -> dict:
    if not addresses:
        return {}

    marks = ",".join("?" * len(addresses))
    with _db() as conn:
        rows = conn.execute(f"SELECT recipient, COUNT(*) FROM emails WHERE recipient IN ({marks}) GROUP BY recipient",
                            addresses).fetchall()
    return {row[0]: row[1] for row in rows}

# One email with its body, or None
def get_email(email_id: str):
    with _db() as conn:
        row = conn.execute("SELECT * FROM emails WHERE id = ?", (email_id,)).fetchone()
    return _to_email(row) if row else None

# Deletes one email from an inbox. Returns False if it was not found
def delete_email(address: str, email_id: str) -> bool:
    with _db() as conn:
        return conn.execute("DELETE FROM emails WHERE id = ? AND recipient = ?", (email_id, address)).rowcount > 0

# Moves emails from the old inbox.json into the database, once. Run this outside
# the server process (see migrate_inbox.py): loading the file takes a lot of memory
def migrate_json_inbox() -> int:
    if not os.path.exists(config.INBOX_FILE_NAME):
        return 0

    with open(config.INBOX_FILE_NAME, "r", encoding="utf-8") as f:
        inbox = json.load(f)

    count = 0
    with _db() as conn:
        for address, emails in inbox.items():
            for email in emails:
                email["To"] = address
                email.setdefault("Id", uuid.uuid4().hex)
                email["Code"] = extract_code(email.get("Subject"), email.get("Body"))
                email["Link"] = extract_link(email.get("Subject"), email.get("Body"))
                _insert(conn, email)
                count += 1

    # the emails are in the database now; the file is kept as a backup
    os.replace(config.INBOX_FILE_NAME, config.INBOX_FILE_NAME + ".migrated")
    return count
