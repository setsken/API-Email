from flask import Blueprint, render_template
from .. import auth
import config

bp = Blueprint('pages', __name__)

# The main route that serves the website
@bp.route('/')
def index():
    # the admin link is only shown when the admin panel is turned on
    return render_template('index.html', admin_enabled=auth.admin_enabled())