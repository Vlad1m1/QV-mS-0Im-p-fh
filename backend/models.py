from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any, Literal, TypedDict

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from backend.auth.models import normalize_email


class InputModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')


class ExperimentFields(InputModel):
    title: str = Field(min_length=1, max_length=200)
    objective: str = Field(min_length=1, max_length=6000)
    date: date


class ExperimentCreateFields(ExperimentFields):
    work_mode: Literal['solo', 'shared'] = 'solo'
    collaborator_emails: list[str] = Field(default_factory=list, max_length=20)

    @field_validator('collaborator_emails')
    @classmethod
    def emails(cls, values: list[str]) -> list[str]:
        normalized = [normalize_email(value) for value in values]
        if len(normalized) != len(set(normalized)):
            raise ValueError('Email участников не должны повторяться')
        return normalized

    @model_validator(mode='after')
    def collaborators_match_mode(self) -> 'ExperimentCreateFields':
        if self.work_mode == 'solo' and self.collaborator_emails:
            raise ValueError('Для одиночной работы нельзя указывать участников')
        return self


class ExperimentEditFields(ExperimentFields):
    expected_version: int = Field(gt=0)
    reason: str = Field(min_length=1, max_length=1000)


class ExperimentInput(ExperimentCreateFields):
    author_id: int = Field(gt=0)


class ExperimentEdit(ExperimentEditFields):
    author_id: int = Field(gt=0)


def numeric(value: str) -> str:
    value = value.replace(',', '.')
    try:
        if not Decimal(value).is_finite():
            raise ValueError('Укажите конечное число')
    except InvalidOperation:
        raise ValueError('Укажите число, например 20 или 1,25') from None
    return value


class Measurement(InputModel):
    name: str = Field(min_length=1, max_length=120)
    value: str = Field(min_length=1, max_length=60)
    unit: str = Field(min_length=1, max_length=40)
    _numeric = field_validator('value')(numeric)


class AttemptFields(InputModel):
    parameters: list[Measurement] = Field(min_length=1, max_length=50)
    result_name: str = Field(min_length=1, max_length=120)
    result_value: str = Field(min_length=1, max_length=60)
    result_unit: str = Field(min_length=1, max_length=40)
    note: str = Field(default='', max_length=6000)
    _numeric = field_validator('result_value')(numeric)

    @field_validator('parameters')
    @classmethod
    def unique_names(cls, values: list[Measurement]) -> list[Measurement]:
        names = [value.name.casefold() for value in values]
        if len(names) != len(set(names)):
            raise ValueError('Названия параметров не должны повторяться')
        return values


class AttemptEditFields(AttemptFields):
    expected_version: int = Field(gt=0)
    reason: str = Field(min_length=1, max_length=1000)


class AttemptInput(AttemptFields):
    author_id: int = Field(gt=0)


class AttemptEdit(AttemptEditFields):
    author_id: int = Field(gt=0)


class ObservationFields(InputModel):
    content: str = Field(min_length=1, max_length=6000)


class Observation(ObservationFields):
    author_id: int = Field(gt=0)


@dataclass(frozen=True)
class ExperimentFilters:
    q: str = ''
    parameter: str = ''
    author_id: int | None = None
    date_from: date | None = None
    date_to: date | None = None


class Author(TypedDict):
    id: int
    name: str


class ExperimentRecord(TypedDict):
    id: int
    number: int
    work_mode: Literal['solo', 'shared']
    title: str
    objective: str
    date: str
    author_id: int
    created_at: str
    version: int


class ParameterRecord(TypedDict):
    name: str
    value: str
    unit: str


class AttemptVersion(TypedDict):
    id: int
    attempt_id: int
    version: int
    result_name: str
    result_value: str
    result_unit: str
    note: str
    author_id: int
    created_at: str
    reason: str
    author: str
    parameters: list[ParameterRecord]


class AttemptRecord(TypedDict):
    id: int
    experiment_id: int
    number: int
    author_id: int
    created_at: str
    author: str
    versions: list[AttemptVersion]
    current: AttemptVersion


class HistoryEvent(TypedDict):
    id: int
    experiment_id: int
    attempt_id: int | None
    kind: str
    author_id: int
    created_at: str
    content: str
    author: str
    before: dict[str, Any] | None
    after: dict[str, Any] | None


class ExperimentSummary(ExperimentRecord):
    author: str
    participants: list[Author]
    attempt_count: int
    event_count: int


class ExperimentDetail(ExperimentRecord):
    author: str
    participants: list[Author]
    attempts: list[AttemptRecord]
    history: list[HistoryEvent]
