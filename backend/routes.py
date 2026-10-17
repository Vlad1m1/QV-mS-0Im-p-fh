from datetime import date
from fastapi import APIRouter, Depends, FastAPI, Query, Request
from fastapi.responses import JSONResponse, Response

from backend.auth.http import MutationSessionDependency, SessionDependency, require_session
from backend.dependencies import DatabaseDependency
from backend.errors import InvalidOperation, JournalError, NotFound, VersionConflict
from backend.exports import export_experiment
from backend.models import (
    AttemptEdit, AttemptInput, AttemptRecord, Author, ExperimentDetail,
    ExperimentEdit, ExperimentFilters, ExperimentInput, ExperimentRecord,
    ExperimentSummary, Observation, ExperimentCreateFields, ExperimentEditFields,
    AttemptFields, AttemptEditFields, ObservationFields,
)
from backend.service import JournalService, utc_now

router = APIRouter(prefix='/api')
journal_router = APIRouter(dependencies=[Depends(require_session)])


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(JournalError)
    async def journal_error(_request: Request, error: JournalError) -> JSONResponse:
        statuses = {NotFound: 404, InvalidOperation: 422, VersionConflict: 409}
        return JSONResponse(status_code=statuses[type(error)], content={'detail': str(error)})


@router.get('/health')
def health() -> dict[str, str]:
    return {'status': 'ok'}


@journal_router.get('/authors', response_model=None)
def authors(database: DatabaseDependency, session: SessionDependency) -> list[Author]:
    with JournalService.transaction(database, actor_id=session.user.author_id) as journal:
        return journal.authors()


@journal_router.get('/experiments', response_model=None)
def experiments(database: DatabaseDependency, session: SessionDependency, q: str = Query('', max_length=300),
                parameter: str = Query('', max_length=200), author_id: int | None = None,
                date_from: date | None = None, date_to: date | None = None) -> list[ExperimentSummary]:
    with JournalService.transaction(database, actor_id=session.user.author_id) as journal:
        return journal.experiments(ExperimentFilters(q, parameter, author_id, date_from, date_to))


@journal_router.post('/experiments', status_code=201, response_model=None)
def new_experiment(payload: ExperimentCreateFields, database: DatabaseDependency,
                   session: MutationSessionDependency) -> ExperimentRecord:
    with JournalService.transaction(database, write=True) as journal:
        return journal.create_experiment(ExperimentInput(**payload.model_dump(), author_id=session.user.author_id))


@journal_router.get('/experiments/{experiment_id}', response_model=None)
def get_experiment(experiment_id: int, database: DatabaseDependency, session: SessionDependency) -> ExperimentDetail:
    with JournalService.transaction(database, actor_id=session.user.author_id) as journal:
        return journal.detail(experiment_id)


@journal_router.put('/experiments/{experiment_id}', response_model=None)
def edit_experiment(experiment_id: int, payload: ExperimentEditFields, database: DatabaseDependency,
                    session: MutationSessionDependency) -> ExperimentRecord:
    with JournalService.transaction(database, write=True) as journal:
        return journal.edit_experiment(experiment_id, ExperimentEdit(**payload.model_dump(), author_id=session.user.author_id))


@journal_router.post('/experiments/{experiment_id}/attempts', status_code=201, response_model=None)
def new_attempt(experiment_id: int, payload: AttemptFields, database: DatabaseDependency,
                session: MutationSessionDependency) -> AttemptRecord:
    with JournalService.transaction(database, write=True) as journal:
        return journal.create_attempt(experiment_id, AttemptInput(**payload.model_dump(), author_id=session.user.author_id))


@journal_router.put('/attempts/{attempt_id}', response_model=None)
def edit_attempt(attempt_id: int, payload: AttemptEditFields, database: DatabaseDependency,
                 session: MutationSessionDependency) -> AttemptRecord:
    with JournalService.transaction(database, write=True) as journal:
        return journal.edit_attempt(attempt_id, AttemptEdit(**payload.model_dump(), author_id=session.user.author_id))


@journal_router.post('/experiments/{experiment_id}/observations', status_code=201)
def observe(experiment_id: int, payload: ObservationFields, database: DatabaseDependency,
            session: MutationSessionDependency) -> dict[str, str]:
    with JournalService.transaction(database, write=True) as journal:
        return journal.observe(experiment_id, Observation(**payload.model_dump(), author_id=session.user.author_id))


@journal_router.get('/experiments/{experiment_id}/export')
def export(experiment_id: int, database: DatabaseDependency, session: SessionDependency,
           format: str = Query('json', pattern='^(json|csv)$')) -> Response:
    with JournalService.transaction(database, actor_id=session.user.author_id) as journal:
        data = journal.detail(experiment_id)
    document = export_experiment(data, format, utc_now())
    return Response(document.body, media_type=document.media_type,
                    headers={'Content-Disposition': f'attachment; filename="{document.filename}"'})


router.include_router(journal_router)
