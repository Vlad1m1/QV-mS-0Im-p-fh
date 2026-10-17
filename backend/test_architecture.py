"""Regressions for transaction ownership and bulk reads, independent of HTTP."""
import json

import pytest

from backend.database import Database
from backend.models import AttemptEdit, AttemptInput, ExperimentEdit, ExperimentFilters, ExperimentInput
from backend.repository import JournalRepository
from backend.service import JournalService


@pytest.fixture
def database(tmp_path):
    database = Database.configured(tmp_path / 'journal.sqlite3')
    database.initialize()
    with JournalService.transaction(database, write=True) as journal:
        journal.initialize(seed_demo=True)
    return database


def attempt_payload() -> AttemptInput:
    return AttemptInput(author_id=1, parameters=[{'name': 'Температура', 'value': '20', 'unit': '°C'}],
                        result_name='Масса', result_value='31.6', result_unit='g')


@pytest.mark.parametrize('filters', [ExperimentFilters(), ExperimentFilters(q='ТЕМПЕРАТУРА', parameter='20 °C')])
def test_journal_list_uses_two_queries_without_decoding_history(database, monkeypatch, filters):
    with JournalService.transaction(database, write=True) as journal:
        for index in range(12):
            experiment = journal.create_experiment(ExperimentInput(
                title=f'Температура: опыт {index}', objective='Учебные данные', date='2026-10-16', author_id=1,
            ))
            attempt = journal.create_attempt(experiment['id'], attempt_payload())
            journal.edit_attempt(attempt['id'], AttemptEdit(
                **{**attempt_payload().model_dump(), 'result_value': '32'},
                expected_version=1, reason='Учебное исправление',
            ))

    def history_was_decoded(_value):
        pytest.fail('The list must not deserialize history snapshots')

    with database.transaction() as db:
        statements = []
        db.set_trace_callback(statements.append)
        monkeypatch.setattr(json, 'loads', history_was_decoded)
        rows = JournalRepository(db).experiments(filters)
    reads = [sql for sql in statements if sql.lstrip().upper().startswith(('SELECT', 'WITH'))]
    assert len(rows) >= 12
    assert len(reads) == 2
    assert all('attempts' not in row and 'history' not in row for row in rows)


@pytest.mark.parametrize('operation', ['new_attempt', 'edit_attempt', 'edit_experiment'])
def test_failure_to_write_history_rolls_back_the_entire_change(database, monkeypatch, operation):
    with JournalService.transaction(database) as journal:
        before = journal.detail(1)

    def unavailable_history(*_args, **_kwargs):
        raise RuntimeError('Simulated history persistence failure')

    monkeypatch.setattr(JournalRepository, 'add_event', unavailable_history)
    with pytest.raises(RuntimeError, match='history persistence failure'):
        with JournalService.transaction(database, write=True) as journal:
            if operation == 'new_attempt':
                journal.create_attempt(1, attempt_payload())
            elif operation == 'edit_attempt':
                current = before['attempts'][0]['current']
                journal.edit_attempt(before['attempts'][0]['id'], AttemptEdit(
                    **{**attempt_payload().model_dump(), 'result_value': '42'},
                    expected_version=current['version'], reason='Учебное исправление',
                ))
            else:
                journal.edit_experiment(1, ExperimentEdit(
                    title='Изменённый заголовок', objective=before['objective'], date=before['date'],
                    author_id=2, expected_version=before['version'], reason='Уточнение',
                ))
    with JournalService.transaction(database) as journal:
        assert journal.detail(1) == before
