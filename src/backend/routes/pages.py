from flask import Blueprint, render_template, request
from .. import auth
import config

bp = Blueprint('pages', __name__)

# The main route that serves the website. ?embed=1 is the version shown inside
# the admin panel: without the header, in Russian like the rest of the panel
@bp.route('/')
def index():
    # the admin link is only shown when the admin panel is turned on
    return render_template('index.html', admin_enabled=auth.admin_enabled(), embed=request.args.get('embed') == '1')

# Documentation of the API for external programs
@bp.route('/api/docs')
def api_docs():
    return render_template('api_docs.html', base_url=config.PUBLIC_URL or request.url_root.rstrip('/'))
