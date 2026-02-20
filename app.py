import config
from src.backend.flask_app import run_flask_server

if __name__ == "__main__":
    print(f"Starting Maildrop for {config.DOMAIN}")
    print(f"Server: http://{config.FLASK_HOST}:{config.FLASK_PORT}")
    run_flask_server(config.FLASK_HOST, config.FLASK_PORT)