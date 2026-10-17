from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.auth.http import register_auth_boundary, router as auth_router
from backend.database import Database, ROOT
from backend.routes import register_error_handlers, router
from backend.service import JournalService


def create_app(db_path: str | Path | None = None, seed_demo: bool = False,
               *, serve_frontend: bool = True) -> FastAPI:
    database = Database.configured(db_path)
    database.initialize()
    with JournalService.transaction(database, write=True) as journal:
        journal.initialize(seed_demo=seed_demo)

    app = FastAPI(title='Общий лабораторный журнал', version='1.0.0')
    app.state.database = database
    app.state.db_path = database.path
    register_error_handlers(app)
    register_auth_boundary(app)
    app.include_router(auth_router)
    app.include_router(router)
    if serve_frontend:
        _mount_frontend(app, ROOT / 'frontend' / 'dist')
    return app


def create_api_app() -> FastAPI:
    return create_app(serve_frontend=False)


def _mount_frontend(app: FastAPI, dist: Path) -> None:
    if not dist.exists():
        return
    app.mount('/assets', StaticFiles(directory=dist / 'assets'), name='assets')

    @app.get('/favicon.svg', include_in_schema=False)
    def favicon() -> FileResponse:
        return FileResponse(dist / 'favicon.svg')

    @app.get('/', include_in_schema=False)
    def index() -> FileResponse:
        return FileResponse(dist / 'index.html')
