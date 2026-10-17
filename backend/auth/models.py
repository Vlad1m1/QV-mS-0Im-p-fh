from dataclasses import dataclass
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator


def normalize_email(value: str) -> str:
    email = value.strip().casefold()
    if len(email) > 254 or email.count('@') != 1:
        raise ValueError('Укажите корректный email')
    local, domain = email.split('@')
    if (not re.fullmatch(r"[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}", local)
            or local.startswith('.') or local.endswith('.') or '..' in local):
        raise ValueError('Укажите корректный email')
    try:
        domain = domain.encode('idna').decode('ascii')
    except UnicodeError:
        raise ValueError('Укажите корректный email') from None
    labels = domain.split('.')
    if (len(labels) < 2 or len(domain) > 253
            or any(not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', label)
                   for label in labels)
            or len(labels[-1]) < 2):
        raise ValueError('Укажите корректный email')
    normalized = f'{local}@{domain}'
    if len(normalized) > 254:
        raise ValueError('Укажите корректный email')
    return normalized


class Credentials(BaseModel):
    model_config = ConfigDict(extra='forbid')

    email: str = Field(max_length=254)
    password: str = Field(min_length=1, max_length=128, repr=False)
    _email = field_validator('email')(normalize_email)


class AccountCredentials(Credentials):
    password: str = Field(min_length=9, max_length=128, repr=False)

    @field_validator('password')
    @classmethod
    def no_password_whitespace(cls, value: str) -> str:
        if any(character.isspace() for character in value):
            raise ValueError('Пароль не должен содержать пробелы.')
        return value


class Registration(AccountCredentials):
    name: str = Field(min_length=1, max_length=100)

    @field_validator('name')
    @classmethod
    def valid_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError('Укажите имя участника')
        if any(ord(character) < 24 or ord(character) == 127 for character in value):
            raise ValueError('Используется невалидный символ')
        return value


@dataclass(frozen=True)
class User:
    id: int
    author_id: int
    name: str
    email: str


@dataclass(frozen=True)
class Session:
    user: User
    csrf_token: str
    expires_at: int


@dataclass(frozen=True)
class IssuedSession:
    token: str
    session: Session


class SessionResponse(BaseModel):
    user: User
    csrf_token: str
    expires_at: str
