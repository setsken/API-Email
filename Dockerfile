FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt requirements.txt

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

# By default glibc keeps a separate memory pool per thread and rarely gives it
# back to the system, which inflates the memory of a threaded server
ENV MALLOC_ARENA_MAX=2

# Railway passes the port in $PORT; a shell is needed to expand it.
# A failed migration must not stop the server: the old file stays for the next start.
# -u: its messages reach the logs right away
CMD ["sh", "-c", "python -u migrate_inbox.py; exec gunicorn --bind 0.0.0.0:${PORT:-5000} --workers 1 --threads 8 --timeout 120 src.backend.flask_app:app"]
