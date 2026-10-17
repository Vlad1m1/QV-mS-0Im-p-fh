from datetime import datetime, timezone
import hmac
import os
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from backend.auth.errors import AuthError, InvalidAccount, InvalidCredentials, NoSession, RateLimited, RegistrationConflict
from backend.auth.models import Credentials, IssuedSession, Registration, Session, SessionResponse
from backend.auth.service import AuthService, SESSION_SECONDS
from backend.dependencies import DatabaseDependency

COOKIE_NAME = 'labnote_session'
UNSAFE_METHODS = frozenset({'POST', 'PUT', 'PATCH', 'DELETE'})
router = APIRouter(prefix='/api/auth', tags=['auth'])


def require_session(request: Request, database: DatabaseDependency) -> Session:
    return AuthService(database).session(request.cookies.get(COOKIE_NAME))


SessionDependency = Annotated[Session, Depends(require_session)]


def require_mutation_session(request: Request, session: SessionDependency) -> Session:
    supplied = request.headers.get('x-csrf-token', '')
    if (len(supplied) != len(session.csrf_token) or not supplied.isascii()
            or not hmac.compare_digest(supplied, session.csrf_token)):
        raise HTTPException(status_code=403, detail='Проверка безопасности не пройдена. Обновите страницу.')
    return session


MutationSessionDependency = Annotated[Session, Depends(require_mutation_session)]


def _origin_tuple(value: str) -> tuple[str, str, int] | None:
    try:
        parsed = urlsplit(value)
        if (parsed.scheme not in {'http', 'https'} or not parsed.hostname
                or parsed.username is not None or parsed.password is not None
                or parsed.path not in {'', '/'} or parsed.query or parsed.fragment):
            return None
        return parsed.scheme, parsed.hostname.casefold(), parsed.port or (443 if parsed.scheme == 'https' else 80)
    except ValueError:
        return None


def _same_origin(request: Request) -> bool:
    if request.headers.get('sec-fetch-site', '').casefold() not in {'', 'same-origin', 'none'}:
        return False
    origin = request.headers.get('origin')
    if origin is None:
        return True
    return _origin_tuple(origin) is not None and _origin_tuple(origin) == _origin_tuple(str(request.base_url))


def register_auth_boundary(app: FastAPI) -> None:
    @app.middleware('http')
    async def api_security(request: Request, call_next):
        if request.url.path.startswith('/api/'):
            if request.method in UNSAFE_METHODS and not _same_origin(request):
                response = JSONResponse(status_code=403, content={'detail': 'Запрос с другого сайта запрещён.'})
            elif (request.url.path in {'/api/auth/login', '/api/auth/register'}
                  and request.method == 'POST'
                  and request.headers.get('content-type', '').split(';')[0].strip().casefold() != 'application/json'):
                response = JSONResponse(status_code=415, content={'detail': 'Передайте данные в формате JSON.'})
            else:
                response = await call_next(request)
            response.headers['Cache-Control'] = 'no-store'
            return response
        return await call_next(request)

    @app.exception_handler(AuthError)
    async def auth_error(_request: Request, error: AuthError) -> JSONResponse:
        statuses = {InvalidCredentials: 401, NoSession: 401, RegistrationConflict: 409,
                    InvalidAccount: 422, RateLimited: 429}
        headers = {'Retry-After': str(error.retry_after)} if isinstance(error, RateLimited) else {}
        return JSONResponse(status_code=statuses[type(error)], content={'detail': str(error)}, headers=headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, error: RequestValidationError) -> JSONResponse:
        errors = [{'loc': list(item['loc']), 'msg': item['msg'], 'type': item['type']}
                  for item in error.errors()]
        return JSONResponse(status_code=422, content={'detail': errors})


def _response(session: Session) -> SessionResponse:
    return SessionResponse(user=session.user, csrf_token=session.csrf_token,
                           expires_at=datetime.fromtimestamp(session.expires_at, timezone.utc).isoformat())


def _set_cookie(request: Request, response: Response, issued: IssuedSession) -> SessionResponse:
    response.set_cookie(COOKIE_NAME, issued.token, max_age=SESSION_SECONDS, httponly=True,
                        secure=request.url.scheme == 'https' or os.environ.get('LAB_COOKIE_SECURE') == '1',
                        samesite='lax', path='/')
    return _response(issued.session)


def _source(request: Request) -> str:
    return request.client.host if request.client else 'unknown'


@router.post('/register', status_code=201, response_model=SessionResponse)
def register(payload: Registration, request: Request, response: Response,
             database: DatabaseDependency) -> SessionResponse:
    issued = AuthService(database).register(payload, _source(request), request.cookies.get(COOKIE_NAME))
    return _set_cookie(request, response, issued)


@router.post('/login', response_model=SessionResponse)
def login(payload: Credentials, request: Request, response: Response,
          database: DatabaseDependency) -> SessionResponse:
    issued = AuthService(database).login(payload, _source(request), request.cookies.get(COOKIE_NAME))
    return _set_cookie(request, response, issued)


@router.get('/session', response_model=SessionResponse)
def current_session(session: SessionDependency) -> SessionResponse:
    return _response(session)


@router.post('/logout', status_code=204)
def logout(request: Request, database: DatabaseDependency, session: MutationSessionDependency) -> Response:
    AuthService(database).logout(request.cookies[COOKIE_NAME])
    response = Response(status_code=204)
    response.delete_cookie(COOKIE_NAME, httponly=True, samesite='lax', path='/',
                           secure=request.url.scheme == 'https' or os.environ.get('LAB_COOKIE_SECURE') == '1')
    return response
