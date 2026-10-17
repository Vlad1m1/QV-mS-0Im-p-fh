from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone

from backend.database import Database
from backend.errors import InvalidOperation, VersionConflict
from backend.models import (
    AttemptEdit, AttemptInput, AttemptRecord, Author, ExperimentDetail,
    ExperimentEdit, ExperimentFilters, ExperimentInput, ExperimentRecord,
    ExperimentSummary, Observation,
)
from backend.repository import JournalRepository
from backend.seed import populate


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='microseconds')


class JournalService:
    def __init__(self, repository: JournalRepository, actor_id: int | None = None) -> None:
        self._repository = repository
        self._actor_id = actor_id

    @classmethod
    @contextmanager
    def transaction(cls, database: Database, *, write: bool = False, actor_id: int | None = None) -> Iterator['JournalService']:
        with database.transaction(write=write) as db:
            yield cls(JournalRepository(db), actor_id)

    def initialize(self, *, seed_demo: bool) -> None:
        if seed_demo:
            self._repository.initialize_authors()
            if not self._repository.has_experiments():
                populate(self)

    def _check_author(self, author_id: int) -> None:
        if not self._repository.author_exists(author_id):
            raise InvalidOperation('Выберите участника из списка')

    def authors(self) -> list[Author]:
        if self._actor_id is None:
            raise RuntimeError('An authenticated author is required to list collaborators')
        return self._repository.authors(self._actor_id)

    def experiments(self, filters: ExperimentFilters) -> list[ExperimentSummary]:
        if filters.date_from and filters.date_to and filters.date_from > filters.date_to:
            raise InvalidOperation('Начало периода должно быть раньше конца')
        return self._repository.experiments(filters, self._actor_id)

    def detail(self, experiment_id: int) -> ExperimentDetail:
        return self._repository.detail(experiment_id, self._actor_id)

    def create_experiment(self, payload: ExperimentInput, stamp: str | None = None,
                          *, collaborator_author_ids: list[int] | None = None) -> ExperimentRecord:
        self._check_author(payload.author_id)
        collaborators = (self._repository.collaborator_ids(payload.collaborator_emails)
                         if collaborator_author_ids is None else collaborator_author_ids)
        if (len(collaborators) != (len(payload.collaborator_emails) if collaborator_author_ids is None else len(collaborator_author_ids))
                or payload.author_id in collaborators
                or (payload.work_mode == 'shared' and not collaborators)
                or (payload.work_mode == 'solo' and collaborators)
                or len(collaborators) != len(set(collaborators))):
            raise InvalidOperation('Для совместной работы укажите email других зарегистрированных участников. Проверьте список участников.')
        for author_id in collaborators:
            self._check_author(author_id)
        stamp = stamp or utc_now()
        experiment = self._repository.create_experiment(payload, stamp, collaborators)
        self._repository.add_event(experiment['id'], payload.author_id, 'experiment_created',
                                   'Создан эксперимент', stamp, after=experiment)
        return experiment

    def edit_experiment(self, experiment_id: int, payload: ExperimentEdit) -> ExperimentRecord:
        self._check_author(payload.author_id)
        old = self._repository.experiment(experiment_id, payload.author_id)
        if old['version'] != payload.expected_version:
            raise VersionConflict('Эксперимент уже изменён. Закройте форму и обновите данные.')
        if (old['title'], old['objective'], old['date']) == (payload.title, payload.objective, str(payload.date)):
            raise InvalidOperation('Данные не изменились')
        updated = self._repository.update_experiment(experiment_id, payload)
        self._repository.add_event(experiment_id, payload.author_id, 'experiment_edited',
                                   f'Изменена карточка: {payload.reason}', utc_now(), before=old, after=updated)
        return updated

    def create_attempt(self, experiment_id: int, payload: AttemptInput, stamp: str | None = None) -> AttemptRecord:
        self._repository.experiment(experiment_id, payload.author_id)
        self._check_author(payload.author_id)
        stamp = stamp or utc_now()
        attempt_id = self._repository.create_attempt(experiment_id, payload.author_id, stamp)
        self._repository.create_version(attempt_id, payload, 1, stamp, '')
        attempt = self._repository.attempt(attempt_id)
        self._repository.add_event(experiment_id, payload.author_id, 'attempt_created',
                                   f'Добавлена попытка №{attempt["number"]}', stamp,
                                   after=attempt['current'], attempt_id=attempt_id)
        return attempt

    def edit_attempt(self, attempt_id: int, payload: AttemptEdit, stamp: str | None = None) -> AttemptRecord:
        self._check_author(payload.author_id)
        self._repository.check_attempt_access(attempt_id, payload.author_id)
        attempt = self._repository.attempt(attempt_id)
        old = attempt['current']
        if old['version'] != payload.expected_version:
            raise VersionConflict('Запись уже изменена другим участником. Закройте форму, обновите данные и повторите исправление.')
        fields = ('parameters', 'result_name', 'result_value', 'result_unit', 'note')
        new = payload.model_dump()
        if all(old[field] == new[field] for field in fields):
            raise InvalidOperation('Данные не изменились')
        stamp = stamp or utc_now()
        self._repository.create_version(attempt_id, payload, old['version'] + 1, stamp, payload.reason)
        updated = self._repository.attempt(attempt_id)
        self._repository.add_event(attempt['experiment_id'], payload.author_id, 'attempt_edited',
                                   f'Исправлена попытка №{attempt["number"]}: {payload.reason}', stamp,
                                   before=old, after=updated['current'], attempt_id=attempt_id)
        return updated

    def observe(self, experiment_id: int, payload: Observation, stamp: str | None = None) -> dict[str, str]:
        self._repository.experiment(experiment_id, payload.author_id)
        self._check_author(payload.author_id)
        stamp = stamp or utc_now()
        self._repository.add_event(experiment_id, payload.author_id, 'observation', payload.content, stamp)
        return {'created_at': stamp, 'content': payload.content}
