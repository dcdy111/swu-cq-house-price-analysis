from __future__ import annotations

from flask import Flask
from flask import g, request

from Backend.api.agent import bp as agent_bp
from Backend.api.analysis import bp as analysis_bp
from Backend.api.auth import bp as auth_bp
from Backend.api.charts import bp as charts_bp
from Backend.api.crawl import bp as crawl_bp
from Backend.api.health import bp as health_bp
from Backend.api.listings import bp as listings_bp
from Backend.api.overview import bp as overview_bp
from Backend.api.quality import bp as quality_bp
from Backend.api.scheduler import bp as scheduler_bp
from Backend.api.settings import bp as settings_bp
from Backend.config import BaseConfig
from Backend.extensions import db
from Backend.services.auth_service import AuthService
from Backend.tasks.scheduler import init_scheduler
from Backend import models  # noqa: F401
from Backend.utils.response import api_error


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__)
    app.config.from_object(BaseConfig)
    if test_config:
        app.config.update(test_config)

    db.init_app(app)
    register_auth_guard(app)
    register_blueprints(app)
    register_cors(app)
    register_cli(app)
    init_scheduler(app)
    return app


def register_blueprints(app: Flask) -> None:
    app.register_blueprint(auth_bp)
    app.register_blueprint(health_bp)
    app.register_blueprint(overview_bp)
    app.register_blueprint(charts_bp)
    app.register_blueprint(listings_bp)
    app.register_blueprint(crawl_bp)
    app.register_blueprint(quality_bp)
    app.register_blueprint(analysis_bp)
    app.register_blueprint(agent_bp)
    app.register_blueprint(scheduler_bp)
    app.register_blueprint(settings_bp)


def register_auth_guard(app: Flask) -> None:
    @app.before_request
    def require_auth():
        if request.method == "OPTIONS":
            return None
        if not request.path.startswith("/api"):
            return None
        if request.path == "/api/health" or request.path == "/api/auth/login":
            return None
        if app.config.get("TESTING") or not app.config.get("AUTH_REQUIRED", False):
            return None

        auth_header = request.headers.get("Authorization", "")
        token = ""
        if auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1].strip()
        token = token or request.args.get("access_token", "")
        user = AuthService.verify_token(token)
        if user is None:
            return api_error("未登录或登录已过期", status_code=401)
        g.current_user = user
        return None


def register_cors(app: Flask) -> None:
    @app.after_request
    def add_cors_headers(response):
        response.headers.setdefault("Access-Control-Allow-Origin", "*")
        response.headers.setdefault("Access-Control-Allow-Headers", "Content-Type, Authorization")
        response.headers.setdefault("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        return response


def register_cli(app: Flask) -> None:
    @app.cli.command("init-db")
    def init_db():
        with app.app_context():
            db.create_all()
        print("database initialized")


app = create_app()
