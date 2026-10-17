from datetime import datetime, timezone
import hashlib
import secrets
import sqlite3
import time

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from backend.auth.errors import InvalidAccount, InvalidCredentials, NoSession, RateLimited, RegistrationConflict
from backend.auth.models import AccountCredentials, Credentials, IssuedSession, Registration, Session, User
from backend.auth.repository import AuthRepository
from backend.database import Database

SESSION_SECONDS = 8 * 60 * 60
PASSWORDS = PasswordHasher()
_DUMMY_HASH = PASSWORDS.hash(secrets.token_urlsafe(32))


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def utc_stamp(now: int) -> str:
    return datetime.fromtimestamp(now, timezone.utc).isoformat()


def _bucket(scope: str, value: str) -> str:
    return f'{scope}:{token_hash(value)}'


def _issue(repository: AuthRepository, user: User, now: int, previous_token: str | None) -> IssuedSession:
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    if previous_token:
        repository.revoke(token_hash(previous_token))
    repository.add_session(token_hash(token), user.id, csrf, now, now + SESSION_SECONDS)
    return IssuedSession(token, Session(user, csrf, now + SESSION_SECONDS))


class AuthService:
    def __init__(self, database: Database) -> None:
        self.database = database

    def _throttle(self, limits: list[tuple[str, int, int]], now: int) -> None:
        with self.database.transaction(write=True) as db:
            retry_after = AuthRepository(db).consume_limits(limits, now)
        if retry_after:
            raise RateLimited(retry_after)

    def register(self, payload: Registration, source: str, previous_token: str | None = None) -> IssuedSession:
        now = int(time.time())
        self._throttle([(_bucket('register-source', source), 10, 3600)], now)
        password_hash = PASSWORDS.hash(payload.password)
        try:
            with self.database.transaction(write=True) as db:
                repository = AuthRepository(db)
                author_id = repository.add_author(payload.name)
                user = repository.add_account(payload.email, password_hash, author_id, utc_stamp(now))
                return _issue(repository, user, now, previous_token)
        except sqlite3.IntegrityError:
            raise RegistrationConflict('Не удалось создать аккаунт: email или имя участника уже используются.') from None

    def login(self, payload: Credentials, source: str, previous_token: str | None = None) -> IssuedSession:
        now = int(time.time())
        pair = _bucket('login-pair', source + '\0' + payload.email)
        self._throttle([(pair, 5, 900), (_bucket('login-source', source), 30, 900)], now)
        with self.database.transaction() as db:
            account = AuthRepository(db).account(payload.email)
        try:
            PASSWORDS.verify(account['password_hash'] if account else _DUMMY_HASH, payload.password)
        except (VerificationError, InvalidHashError):
            raise InvalidCredentials('Неверный email или пароль.') from None
        if account is None:
            raise InvalidCredentials('Неверный email или пароль.')
        user = User(account['id'], account['author_id'], account['name'], account['email'])
        updated_hash = PASSWORDS.hash(payload.password) if PASSWORDS.check_needs_rehash(account['password_hash']) else None
        with self.database.transaction(write=True) as db:
            repository = AuthRepository(db)
            if updated_hash:
                repository.update_password_hash(user.id, updated_hash)
            repository.clear_limit(pair)
            return _issue(repository, user, now, previous_token)

    def session(self, token: str | None) -> Session:
        if not token or len(token) > 100:
            raise NoSession('Войдите в аккаунт, чтобы открыть лабораторный журнал.')
        with self.database.transaction() as db:
            session = AuthRepository(db).session(token_hash(token), int(time.time()))
        if session is None:
            raise NoSession('Сессия завершена. Войдите в аккаунт снова.')
        return session

    def logout(self, token: str) -> None:
        with self.database.transaction(write=True) as db:
            AuthRepository(db).revoke(token_hash(token))


def provision_user(database: Database, *, email: str, password: str, author_id: int) -> User:
    credentials = AccountCredentials(email=email, password=password)
    password_hash = PASSWORDS.hash(credentials.password)
    try:
        with database.transaction(write=True) as db:
            repository = AuthRepository(db)
            if repository.author(author_id) is None:
                raise InvalidAccount('Участник с указанным author-id не найден.')
            return repository.add_account(credentials.email, password_hash, author_id, utc_stamp(int(time.time())))
    except sqlite3.IntegrityError:
        raise RegistrationConflict('Email или участник уже привязаны к аккаунту.') from None
