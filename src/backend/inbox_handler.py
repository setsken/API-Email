import json
import re
import os
import threading
import config

# The server runs multiple threads, so the read-modify-write in recv_email
# must not interleave or emails get lost
_inbox_lock = threading.Lock()

# Reads the contents of the inbox.json file and returns it as a dictionary
def read_inbox() -> dict:
    try:
        with open(config.INBOX_FILE_NAME, "r") as f:
            return json.load(f)
    except:
        return {}

# Writes a dictionary to the inbox.json file
def write_inbox(data: dict):
    # Write to a temp file first so a concurrent reader never sees a partial file
    tmp_name = config.INBOX_FILE_NAME + ".tmp"
    with open(tmp_name, "w") as f:
        json.dump(data, f, indent=4)
    os.replace(tmp_name, config.INBOX_FILE_NAME)

# Clears inbox if it exceeds maximum
def check_inbox_size():
    if not os.path.exists(config.INBOX_FILE_NAME):
        return

    if os.path.getsize(config.INBOX_FILE_NAME) > config.MAX_INBOX_SIZE:
        write_inbox({})

# Adds a new email to the inbox
def recv_email(email_json: dict):
    recipient = email_json.get('To')

    if not recipient:
        return

    with _inbox_lock:
        check_inbox_size()
        inbox = read_inbox()

        if recipient not in inbox:
            inbox[recipient] = []

        inbox[recipient].append(email_json)
        write_inbox(inbox)
