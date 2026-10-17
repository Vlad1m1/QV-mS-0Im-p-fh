from concurrent.futures import ThreadPoolExecutor
import sqlite3

from fastapi.testclient import TestClient
import pytest

from backend.app import create_app
from backend.auth.service import provision_user

PASSWORD = 'isolated-journal-test-password'


@pytest.fixture
def accounts(tmp_path):
    app = create_app(tmp_path / 'private.sqlite3')
    clients = []
    for index in range(3):
        client = TestClient(app)
        response = client.post('/api/auth/register', json={
            'name': f'Исследователь {index + 1}', 'email': f'user{index + 1}@example.test', 'password': PASSWORD,
        })
        assert response.status_code == 201, response.text
        client.headers['X-CSRF-Token'] = response.json()['csrf_token']
        clients.append(client)
    return clients


def experiment(client, **fields):
    return client.post('/api/experiments', json={
        'title': 'Измерение температуры', 'objective': 'Проверить измерения', 'date': '2026-10-16', **fields,
    })


def measurement(**fields):
    return {'parameters': [{'name': 'Температура', 'value': '20', 'unit': '°C'}],
            'result_name': 'Масса', 'result_value': '31.6', 'result_unit': 'g', 'note': '', **fields}


def test_default_application_and_signup_are_empty(tmp_path):
    client = TestClient(create_app(tmp_path / 'empty.sqlite3'))
    with client.app.state.database.transaction() as db:
        assert db.execute('SELECT COUNT(*) FROM authors').fetchone()[0] == 0
        assert db.execute('SELECT COUNT(*) FROM experiments').fetchone()[0] == 0
    response = client.post('/api/auth/register', json={'name': 'Новый участник',
        'email': 'new@example.test', 'password': PASSWORD})
    assert response.status_code == 201
    assert client.get('/api/experiments').json() == []
    assert client.get('/api/authors').json() == [{'id': 1, 'name': 'Новый участник'}]
    with client.app.state.database.transaction() as db:
        assert db.execute('SELECT COUNT(*) FROM experiment_members').fetchone()[0] == 0
    restarted = TestClient(create_app(client.app.state.db_path))
    restarted.cookies.update(client.cookies)
    assert restarted.get('/api/experiments').json() == []


def test_solo_data_and_attempt_id_guesses_are_inaccessible(accounts):
    owner, _, outsider = accounts
    created = experiment(owner).json()
    assert (created['number'], created['work_mode']) == (1, 'solo')
    eid = created['id']
    attempt = owner.post(f'/api/experiments/{eid}/attempts', json=measurement()).json()
    original = owner.get(f'/api/experiments/{eid}').json()
    assert original['participants'] == [{'id': 1, 'name': 'Исследователь 1'}]
    for query in ('', '?q=температуры', '?parameter=20', '?author_id=1', '?date_from=2020-01-01'):
        assert outsider.get('/api/experiments' + query).json() == []
    assert outsider.get('/api/authors').json() == [{'id': 3, 'name': 'Исследователь 3'}]
    for suffix in ('', '/export', '/export?format=csv'):
        assert outsider.get(f'/api/experiments/{eid}{suffix}').status_code == 404
    requests = [
        outsider.post(f'/api/experiments/{eid}/attempts', json=measurement()),
        outsider.post(f'/api/experiments/{eid}/observations', json={'content': 'Не должно сохраниться'}),
        outsider.put(f'/api/experiments/{eid}', json={'title': 'Подмена', 'objective': 'Подмена',
            'date': '2026-10-15', 'expected_version': 1, 'reason': 'Подмена'}),
        outsider.put(f'/api/attempts/{attempt["id"]}', json=measurement(result_value='40',
            expected_version=1, reason='Подмена')),
    ]
    assert [response.status_code for response in requests] == [404] * 4
    assert owner.get(f'/api/experiments/{eid}').json() == original


def test_only_selected_members_can_share_and_mode_is_immutable(accounts):
    owner, member, outsider = accounts
    solo = experiment(owner).json()
    shared = experiment(owner, work_mode='shared', collaborator_emails=[' USER2@EXAMPLE.TEST ']).json()
    eid = shared['id']
    assert shared['number'] == 2 and shared['work_mode'] == 'shared'
    expected = [{'id': 1, 'name': 'Исследователь 1'}, {'id': 2, 'name': 'Исследователь 2'}]
    assert owner.get(f'/api/experiments/{eid}').json()['participants'] == expected
    assert member.get('/api/experiments').json()[0]['participants'] == expected
    assert member.get(f'/api/experiments/{solo["id"]}').status_code == 404
    assert [row['id'] for row in member.get('/api/authors').json()] == [1, 2]
    assert outsider.get('/api/experiments').json() == []
    attempt = member.post(f'/api/experiments/{eid}/attempts', json=measurement()).json()
    assert attempt['author_id'] == 2
    edit = {'title': 'Уточнение', 'objective': 'Проверить измерения', 'date': '2026-10-16',
            'expected_version': 1, 'reason': 'Уточнение'}
    assert member.put(f'/api/experiments/{eid}', json={**edit, 'work_mode': 'solo'}).status_code == 422
    assert member.put(f'/api/experiments/{eid}', json=edit).status_code == 200
    detail = owner.get(f'/api/experiments/{eid}').json()
    assert detail['work_mode'] == 'shared' and detail['participants'] == expected
    assert detail['author_id'] == 1
    assert member.get(f'/api/experiments/{eid}/export').status_code == 200
    assert outsider.get(f'/api/experiments/{eid}/export').status_code == 404


def test_invalid_collaborators_do_not_create_rows_or_consume_numbers(accounts):
    owner, _, _ = accounts
    invalid = [
        {'work_mode': 'shared'},
        {'work_mode': 'shared', 'collaborator_emails': ['missing@example.test']},
        {'work_mode': 'shared', 'collaborator_emails': ['user1@example.test']},
        {'work_mode': 'shared', 'collaborator_emails': ['user2@example.test', 'missing@example.test']},
        {'work_mode': 'shared', 'collaborator_emails': ['user2@example.test', 'USER2@EXAMPLE.TEST']},
        {'work_mode': 'shared', 'collaborator_emails': ['not an email']},
        {'work_mode': 'solo', 'collaborator_emails': ['user2@example.test']},
        {'work_mode': 'unknown'},
    ]
    for fields in invalid:
        response = experiment(owner, **fields)
        assert response.status_code == 422, response.text
    with owner.app.state.database.transaction() as db:
        for table in ('experiments', 'experiment_sequences', 'experiment_members', 'events'):
            assert db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0] == 0
    assert experiment(owner).json()['number'] == 1


def test_numbers_follow_owner_creation_order_across_filters_edits_restart_and_parallel_writes(accounts):
    owner, other, _ = accounts
    first = experiment(owner, date='2050-01-01').json()
    assert experiment(other).json()['number'] == 1
    second = experiment(owner, date='2000-01-01').json()
    assert first['id'] != first['number'] or second['id'] != second['number']
    assert (first['number'], second['number']) == (1, 2)
    assert [row['number'] for row in owner.get('/api/experiments').json()] == [2, 1]
    assert [row['number'] for row in owner.get('/api/experiments?date_to=2001-01-01').json()] == [2]
    edit = {key: first[key] for key in ('title', 'objective', 'date')}
    response = owner.put(f'/api/experiments/{first["id"]}', json={**edit, 'date': '1990-01-01',
        'expected_version': 1, 'reason': 'Уточнение даты'})
    assert response.json()['number'] == 1

    def add(index):
        client = TestClient(owner.app)
        client.cookies.update(owner.cookies)
        client.headers.update(owner.headers)
        return experiment(client, title=f'Опыт {index}')

    with ThreadPoolExecutor(max_workers=4) as pool:
        responses = list(pool.map(add, range(8)))
    assert all(response.status_code == 201 for response in responses)
    assert sorted(response.json()['number'] for response in responses) == list(range(3, 11))
    restarted = TestClient(create_app(owner.app.state.db_path))
    restarted.cookies.update(owner.cookies)
    assert [row['number'] for row in restarted.get('/api/experiments').json()] == list(range(10, 0, -1))
    exported = restarted.get(f'/api/experiments/{first["id"]}/export')
    assert exported.json()['experiment']['number'] == 1
    assert 'educational_data' not in exported.json()
    assert 'experiment-1.json' in exported.headers['content-disposition']


def test_legacy_migration_preserves_history_and_derives_members_once(tmp_path):
    path = tmp_path / 'legacy.sqlite3'
    with sqlite3.connect(path) as db:
        db.executescript('''
            CREATE TABLE authors(id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE);
            CREATE TABLE experiments(id INTEGER PRIMARY KEY,title TEXT NOT NULL,objective TEXT NOT NULL,
                date TEXT NOT NULL,author_id INTEGER NOT NULL REFERENCES authors(id),created_at TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1);
            CREATE TABLE events(id INTEGER PRIMARY KEY,experiment_id INTEGER NOT NULL REFERENCES experiments(id),
                attempt_id INTEGER,kind TEXT NOT NULL,author_id INTEGER NOT NULL REFERENCES authors(id),
                created_at TEXT NOT NULL,content TEXT NOT NULL,before_json TEXT,after_json TEXT);
            INSERT INTO authors VALUES(1,'Первый автор'),(2,'Второй автор'),(3,'Посторонний');
            INSERT INTO experiments VALUES(8,'Первый','Цель','2050-01-01',1,'2026-10-10',1),
                (15,'Второй','Цель','2000-01-01',1,'2026-10-11',1),
                (19,'Чужой','Цель','2020-01-01',3,'2026-10-12',1);
            INSERT INTO events VALUES(1,8,NULL,'experiment_created',1,'2026-10-10','Создан',NULL,'{"original":true}'),
                (2,8,NULL,'observation',2,'2026-10-10','Наблюдение',NULL,NULL);
        ''')
    with ThreadPoolExecutor(max_workers=4) as pool:
        apps = list(pool.map(lambda _: create_app(path), range(4)))
    app = apps[0]
    provision_user(app.state.database, email='first@example.test', password=PASSWORD, author_id=1)
    provision_user(app.state.database, email='second@example.test', password=PASSWORD, author_id=2)
    member = TestClient(app)
    response = member.post('/api/auth/login', json={'email': 'second@example.test', 'password': PASSWORD})
    assert response.status_code == 200
    assert [(row['id'], row['number']) for row in member.get('/api/experiments').json()] == [(8, 1)]
    detail = member.get('/api/experiments/8').json()
    assert detail['work_mode'] == 'shared'
    assert detail['history'][-1]['after'] == {'original': True}
    assert member.get('/api/experiments/15').status_code == 404
    with app.state.database.transaction() as db:
        assert [(row['id'], row['number'], row['work_mode']) for row in db.execute('SELECT * FROM experiments ORDER BY id')] == [
            (8, 1, 'shared'), (15, 2, 'solo'), (19, 1, 'solo')]
    with app.state.database.transaction(write=True) as db:
        db.execute('DELETE FROM experiment_members WHERE experiment_id=8 AND author_id=2')
    restarted = TestClient(create_app(path))
    restarted.cookies.update(member.cookies)
    assert restarted.get('/api/experiments/8').status_code == 404
    with app.state.database.transaction() as db:
        assert db.execute('SELECT after_json FROM events WHERE id=1').fetchone()[0] == '{"original":true}'
