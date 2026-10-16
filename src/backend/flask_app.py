from flask import Flask
from .routes import pages, api, admin, telegram
from . import telegram_bot
import config

app = Flask(__name__, template_folder='../frontend/templates', static_folder='../frontend/static')

# The admin login lives in a signed session cookie
app.secret_key = config.SECRET_KEY
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

app.register_blueprint(pages.bp) # load the blueprint for the all of the main web page routes
app.register_blueprint(api.bp) # load the blueprint for the all of the api routes
app.register_blueprint(admin.bp) # load the blueprint for the admin panel
app.register_blueprint(telegram.bp) # load the blueprint for the telegram bot webhook

# Register the Telegram webhook if a bot token is set
telegram_bot.start()

# Runs the main flask app
def run_flask_server(host, port):
    app.run(host=host, port=port, debug=False)