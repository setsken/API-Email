# Moves emails from the old inbox.json into the database, if that file is still there.
# Runs before the server in its own process (see Dockerfile), so the memory it takes
# to load a big file is given back when it exits.
from src.backend.inbox_handler import migrate_json_inbox

count = migrate_json_inbox()
if count:
    print(f"Moved {count} emails from inbox.json to the database")
