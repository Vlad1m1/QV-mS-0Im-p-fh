import csv
from concurrent.futures import ThreadPoolExecutor
import io
import json
import sqlite3

from fastapi.testclient import TestClient
import pytest

from backend.app import create_app
from backend.auth.service import provision_user
from backend.database import connection

PASSWORD = 'educational-test-password'


def authenticate(client, number=1):
    response = client.post('/api/auth/login', json={'email': f'participant{number}@example.test', 'password': PASSWORD})
    assert response.status_code == 200, response.text
    client.headers['X-CSRF-Token'] = response.json()['csrf_token']


def provision_participants(app):
    with app.state.database.transaction(write=True) as db:
        db.executemany('INSERT OR IGNORE INTO authors(id,name) VALUES(?,?)',
                       [(1, 'Тестовый участник A'), (2, 'Тестовый участник B')])
    for number in (1, 2):
        provision_user(app.state.database, email=f'participant{number}@example.test', password=PASSWORD, author_id=number)


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / 'journal.sqlite3', seed_demo=False)) as c:
        provision_participants(c.app)
        authenticate(c)
        yield c


def create_experiment(client, **kwargs):
    response = client.post('/api/experiments', json={
        'title': 'Влияние температуры на растворимость',
        'objective': 'KNO₃, насыщенный раствор; 100 g воды, перемешивание 5 минут.',
        'date': '2026-10-16', **kwargs,
        'work_mode': 'shared', 'collaborator_emails': ['participant2@example.test'],
    })
    assert response.status_code == 201, response.text
    return response.json()


def attempt_payload(temperature='20', mass='31.6', result='31,0'):
    return {'parameters': [
        {'name': 'Температура', 'value': temperature, 'unit': '°C'},
        {'name': 'Масса воды', 'value': '100', 'unit': 'g'},
        {'name': 'Масса растворённого вещества', 'value': mass, 'unit': 'g'},
    ], 'result_name': 'Растворимость', 'result_value': result,
        'result_unit': 'g/100 g воды', 'note': 'Учебные данные, постоянная температура.'}


def test_full_demonstration_and_restart(client):
    # Separate sessions, one common server and database.
    participant2 = TestClient(client.app)
    authenticate(participant2, 2)
    exp = create_experiment(client)
    eid = exp['id']
    first = client.post(f'/api/experiments/{eid}/attempts', json=attempt_payload()).json()
    assert participant2.get(f'/api/experiments/{eid}').json()['attempts'][0]['id'] == first['id']
    assert participant2.post(f'/api/experiments/{eid}/observations', json={'content': 'Повторяю опыт при 40 °C.'}).status_code == 201
    second = participant2.post(f'/api/experiments/{eid}/attempts', json=attempt_payload('40', '63.9', '63.9')).json()
    before = client.get(f'/api/experiments/{eid}').json()
    assert len(before['attempts']) == 2
    assert before['attempts'][0] == first
    assert [e['author_id'] for e in reversed(before['history'])] == [1, 1, 2, 2]
    payload = {**attempt_payload(result='31.6'), 'expected_version': 1, 'reason': 'Опечатка: 31,0 → 31,6.'}
    response = participant2.put(f'/api/attempts/{first["id"]}', json=payload)
    assert response.status_code == 200
    updated = response.json()
    assert updated['versions'][0]['result_value'] == '31.0'
    assert updated['current']['result_value'] == '31.6'
    assert updated['author_id'] == 1  # Original authorship stays intact.
    assert updated['current']['author_id'] == 2
    detail = client.get(f'/api/experiments/{eid}').json()
    event = detail['history'][0]
    assert (event['before']['result_value'], event['after']['result_value']) == ('31.0', '31.6')
    assert event['author_id'] == 2 and event['created_at']
    assert detail['attempts'][1] == second
    assert client.get('/api/experiments', params={'q': 'ТЕМПЕРАТУРЫ'}).json()[0]['id'] == eid
    assert client.get('/api/experiments', params={'parameter': '40', 'author_id': 2, 'date_from': '2026-10-16', 'date_to': '2026-10-16'}).json()[0]['id'] == eid
    assert client.get('/api/experiments', params={'q': '63.9'}).json()[0]['id'] == eid
    assert client.get('/api/experiments', params={'q': '63,9', 'parameter': '63,9'}).json()[0]['id'] == eid
    assert client.get('/api/experiments', params={'date_to': '2026-10-15'}).json() == []
    export = client.get(f'/api/experiments/{eid}/export?format=json')
    assert export.status_code == 200
    assert export.json()['experiment'] == detail
    assert 'educational_data' not in export.json()
    csv_response = client.get(f'/api/experiments/{eid}/export?format=csv')
    assert csv_response.text.startswith('\ufeff')
    rows = list(csv.reader(io.StringIO(csv_response.text.removeprefix('\ufeff')), delimiter=';'))
    assert len(rows) == 13  # Three immutable versions, three parameters and one result each.
    assert {'31.0', '31.6', '63.9'} <= {r[12] for r in rows[1:] if r[10] == 'Результат'}
    assert 'attachment;' in csv_response.headers['content-disposition']
    # Starting another app process must not reseed or change existing records.
    restarted = TestClient(create_app(client.app.state.db_path))
    restarted.cookies.update(client.cookies)
    assert restarted.get(f'/api/experiments/{eid}').json() == detail
    assert len(restarted.get('/api/experiments').json()) == 1


def test_stale_edits_cannot_overwrite(client):
    eid = create_experiment(client)['id']
    a = client.post(f'/api/experiments/{eid}/attempts', json=attempt_payload()).json()
    payload = {**attempt_payload(result='31.6'), 'expected_version': 1, 'reason': 'Исправление'}
    assert client.put(f'/api/attempts/{a["id"]}', json=payload).status_code == 200
    assert client.put(f'/api/attempts/{a["id"]}', json={**payload, 'result_value': '99'}).status_code == 409
    after = client.get(f'/api/experiments/{eid}').json()
    assert after['attempts'][0]['current']['result_value'] == '31.6'
    assert len(after['attempts'][0]['versions']) == 2
    assert len(after['history']) == 3


def test_experiment_changes_keep_before_and_author(client):
    e = create_experiment(client)
    authenticate(client, 2)
    payload = {'title': 'Уточнённое название', 'objective': 'Уточнённая цель', 'date': '2026-10-15', 'reason': 'Уточнение методики', 'expected_version': 1}
    assert client.put(f'/api/experiments/{e["id"]}', json=payload).status_code == 200
    assert client.put(f'/api/experiments/{e["id"]}', json=payload).status_code == 409
    updated = client.get(f'/api/experiments/{e["id"]}').json()
    assert updated['author_id'] == 1
    assert updated['version'] == 2
    assert updated['history'][0]['before']['objective'] == e['objective']
    assert updated['history'][0]['after']['objective'] == 'Уточнённая цель'
    assert updated['history'][0]['author_id'] == 2
    # Participant search includes the person who only edited the card.
    assert len(client.get('/api/experiments?author_id=2').json()) == 1


@pytest.mark.parametrize('field,value', [('result_value', 'NaN'), ('result_value', 'Infinity'), ('result_value', 'тридцать'), ('result_unit', ' '), ('author_id', 999)])
def test_invalid_attempt_has_no_partial_write(client, field, value):
    eid = create_experiment(client)['id']
    r = client.post(f'/api/experiments/{eid}/attempts', json={**attempt_payload(), field: value})
    assert r.status_code == 422
    detail = client.get(f'/api/experiments/{eid}').json()
    assert detail['attempts'] == []
    assert len(detail['history']) == 1


def test_parameters_required_and_unique(client):
    eid = create_experiment(client)['id']
    payload = attempt_payload()
    payload['parameters'][1]['unit'] = ''
    assert client.post(f'/api/experiments/{eid}/attempts', json=payload).status_code == 422
    payload = attempt_payload()
    payload['parameters'].append(payload['parameters'][0])
    assert client.post(f'/api/experiments/{eid}/attempts', json=payload).status_code == 422
    assert client.post('/api/experiments', json={'title': ' ', 'objective': '', 'date': 'bad'}).status_code == 422
    assert client.get('/api/experiments?date_from=2026-10-16&date_to=2026-10-15').status_code == 422
    assert client.get('/api/experiments/999').status_code == 404
    assert client.get(f'/api/experiments/{eid}/export?format=pdf').status_code == 422


def test_history_tables_immutable_and_transactions_rollback(client):
    eid = create_experiment(client)['id']
    a = client.post(f'/api/experiments/{eid}/attempts', json=attempt_payload()).json()
    for table in ('events', 'attempt_versions', 'measurements'):
        for statement in (f'DELETE FROM {table}', f'UPDATE {table} SET id=id'):
            with pytest.raises(sqlite3.IntegrityError):
                with connection(client.app.state.db_path, True) as db:
                    db.execute(statement)
    with pytest.raises(RuntimeError):
        with connection(client.app.state.db_path, True) as db:
            db.execute('INSERT INTO attempts(experiment_id,number,author_id,created_at) VALUES(?,?,?,?)', (eid, 2, 1, 'test'))
            raise RuntimeError('Simulated failure before version/history write')
    assert client.get(f'/api/experiments/{eid}').json()['attempts'] == [a]


def test_parallel_adds_are_independent(client):
    eid = create_experiment(client)['id']
    def add(i):
        with TestClient(client.app) as session:
            authenticate(session, i % 2 + 1)
            return session.post(f'/api/experiments/{eid}/attempts', json=attempt_payload(str(20 + i), result=str(30 + i)))
    with ThreadPoolExecutor(max_workers=4) as pool:
        responses = list(pool.map(add, range(8)))
    assert all(r.status_code == 201 for r in responses)
    detail = client.get(f'/api/experiments/{eid}').json()
    assert [a['number'] for a in detail['attempts']] == list(range(1, 9))
    assert len(detail['history']) == 9
    assert len({a['id'] for a in detail['attempts']}) == 8


def test_seed_reproducibility_units_and_idempotence(tmp_path):
    path = tmp_path / 'seed.sqlite3'
    client = TestClient(create_app(path, seed_demo=True))
    provision_participants(client.app)
    authenticate(client)
    experiments = client.get('/api/experiments').json()
    assert len(experiments) == 3
    for e in experiments:
        d = client.get(f'/api/experiments/{e["id"]}').json()
        assert len(d['attempts']) == 2
        assert {a['author_id'] for a in d['attempts']} == {1, 2}
        for a in d['attempts']:
            v = a['current']
            p = v['parameters']
            assert all(x['unit'] and x['value'] and x['name'] for x in p)
            assert v['result_unit'] and v['note']
            if 'растворимость' in d['title']:
                assert float(v['result_value']) == pytest.approx(float(p[2]['value']) / float(p[1]['value']) * 100)
            if 'маятника' in d['title']:
                assert float(v['result_value']) == pytest.approx(float(p[2]['value']) / float(p[1]['value']))
    first_export = client.get('/api/experiments/1/export').json()['experiment']
    restarted = TestClient(create_app(path))
    restarted.cookies.update(client.cookies)
    assert restarted.get('/api/experiments/1/export').json()['experiment'] == first_export
    assert len(restarted.get('/api/experiments').json()) == 3


def test_csv_escapes_formulas_and_preserves_json(client):
    eid = create_experiment(client, title='=1+1')['id']
    payload = {**attempt_payload(), 'note': '=HYPERLINK("example")\nСтрока; с кавычками ""'}
    client.post(f'/api/experiments/{eid}/attempts', json=payload)
    response = client.get(f'/api/experiments/{eid}/export?format=csv')
    rows = list(csv.reader(io.StringIO(response.text.lstrip('\ufeff')), delimiter=';'))
    assert rows[1][0] == "'=1+1"
    assert rows[1][14] == "'" + payload['note']
    assert client.get(f'/api/experiments/{eid}/export').json()['experiment']['title'] == '=1+1'
