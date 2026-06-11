from __future__ import annotations

from flask import Flask

from Backend.api.agent import bp as agent_bp
from Backend.api.analysis import bp as analysis_bp
from Backend.api.charts import bp as charts_bp
from Backend.api.crawl import bp as crawl_bp
from Backend.api.health import bp as health_bp
from Backend.api.listings import bp as listings_bp
from Backend.api.overview import bp as overview_bp
from Backend.api.quality import bp as quality_bp
from Backend.api.scheduler import bp as scheduler_bp
from Backend.config import BaseConfig
from Backend.extensions import db
from Backend.tasks.scheduler import init_scheduler
from Backend import models  # noqa: F401


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__)
    app.config.from_object(BaseConfig)
    if test_config:
        app.config.update(test_config)

    db.init_app(app)
    register_blueprints(app)
    register_cors(app)
    register_cli(app)
    init_scheduler(app)
    return app


def register_blueprints(app: Flask) -> None:
    app.register_blueprint(health_bp)
    app.register_blueprint(overview_bp)
    app.register_blueprint(charts_bp)
    app.register_blueprint(listings_bp)
    app.register_blueprint(crawl_bp)
    app.register_blueprint(quality_bp)
    app.register_blueprint(analysis_bp)
    app.register_blueprint(agent_bp)
    app.register_blueprint(scheduler_bp)


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
