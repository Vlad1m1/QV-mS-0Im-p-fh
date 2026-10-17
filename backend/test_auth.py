"""Authentication lifecycle and security regressions using real cookie requests."""
import hashlib
import sqlite3

from fastapi.testclient import TestClient
from pydantic import ValidationError
import pytest

from backend.app import create_app
from backend.auth import service
from backend.auth.errors import InvalidAccount, RegistrationConflict
from backend.auth.service import provision_user
from backend import manage_users

PASSWORD = 'correct-laboratory-password'


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / 'auth.sqlite3', seed_demo=True)) as client:
        yield client


def register(client, *, email='researcher@example.test', name='Новый исследователь', password=PASSWORD):
    return client.post('/api/auth/register', json={'name': name, 'email': email, 'password': password})


def login(client, email='researcher@example.test', password=PASSWORD):
    return client.post('/api/auth/login', json={'email': email, 'password': password})


def count(client, table):
    with client.app.state.database.transaction() as db:
        return db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]


def test_no_default_credentials_and_registration_does_not_claim_seed_authors(client):
    assert count(client, 'users') == 0
    with client.app.state.database.transaction() as db:
        authors_before = [dict(row) for row in db.execute('SELECT * FROM authors')]
    assert register(client, name=authors_before[0]['name']).status_code == 409
    assert count(client, 'users') == 0
    result = register(client)
    assert result.status_code == 201
    data = result.json()
    assert data['user']['id'] == 1 and data['user']['author_id'] == 3
    with client.app.state.database.transaction() as db:
        assert [dict(row) for row in db.execute('SELECT * FROM authors WHERE id<=2')] == authors_before
    assert count(client, 'experiments') == 3


def test_registration_email_normalization_unique_and_atomic(client):
    first = register(client, email='  Researcher@EXAMPLE.test  ')
    assert first.status_code == 201
    assert first.json()['user']['email'] == 'researcher@example.test'
    authors_before = count(client, 'authors')
    assert register(client, email='researcher@example.test', name='Не должен сохраниться').status_code == 409
    assert count(client, 'authors') == authors_before
    assert count(client, 'users') == 1


def test_password_and_session_token_not_stored_or_returned_in_plaintext(client):
    response = register(client)
    assert response.status_code == 201
    cookie = client.cookies['labnote_session']
    assert len(cookie) >= 43
    assert {'HttpOnly', 'SameSite=lax', 'Path=/', 'Max-Age=28800'} <= set(response.headers['set-cookie'].split('; '))
    assert 'Secure' not in response.headers['set-cookie']
    assert PASSWORD not in response.text and 'password_hash' not in response.text
    with client.app.state.database.transaction() as db:
        account = db.execute('SELECT * FROM users').fetchone()
        session = db.execute('SELECT * FROM sessions').fetchone()
    assert account['password_hash'].startswith('$argon2id$')
    assert PASSWORD not in account['password_hash']
    assert session['token_hash'] == hashlib.sha256(cookie.encode()).hexdigest()
    assert cookie not in str(dict(session))
    assert session['expires_at'] - session['created_at'] == 28800


def test_login_normalization_generic_failure_and_existing_literal_password(client):
    password = '  Пароль с пробелами  '
    assert register(client).status_code == 201
    # A password saved before the registration policy changed must still work.
    with client.app.state.database.transaction(write=True) as db:
        db.execute('UPDATE users SET password_hash=?', (service.PASSWORDS.hash(password),))
    wrong = login(client, password=password.strip())
    missing = login(client, email='nobody@example.test', password=password)
    short = login(client, password='wrong')
    assert wrong.status_code == missing.status_code == short.status_code == 401
    assert wrong.json() == missing.json() == short.json()
    assert login(client, email='RESEARCHER@EXAMPLE.TEST', password=password).status_code == 200


def test_successful_login_and_signup_rotate_current_session(client):
    first = register(client)
    old_cookie = client.cookies['labnote_session']
    second = login(client)
    assert second.status_code == 200
    new_cookie = client.cookies['labnote_session']
    assert old_cookie != new_cookie and first.json()['csrf_token'] != second.json()['csrf_token']
    outsider = TestClient(client.app)
    outsider.cookies.set('labnote_session', old_cookie)
    assert outsider.get('/api/auth/session').status_code == 401
    assert register(client, email='another@example.test', name='Другой участник').status_code == 201
    outsider.cookies.set('labnote_session', new_cookie)
    assert outsider.get('/api/auth/session').status_code == 401


def test_session_survives_restart_then_expires(client, monkeypatch):
    issued = register(client).json()
    restarted = TestClient(create_app(client.app.state.db_path))
    restarted.cookies.update(client.cookies)
    assert restarted.get('/api/auth/session').json() == issued
    with client.app.state.database.transaction() as db:
        expiry = db.execute('SELECT expires_at FROM sessions').fetchone()[0]
    monkeypatch.setattr(service.time, 'time', lambda: expiry)
    assert restarted.get('/api/auth/session').status_code == 401
    assert restarted.get('/api/experiments/1/export').status_code == 401


def test_logout_checks_csrf_revokes_cookie_and_old_cookie_cannot_replay(client):
    data = register(client).json()
    token = client.cookies['labnote_session']
    assert client.post('/api/auth/logout').status_code == 403
    assert client.get('/api/auth/session').status_code == 200
    response = client.post('/api/auth/logout', headers={'X-CSRF-Token': data['csrf_token']})
    assert response.status_code == 204 and response.content == b''
    assert 'Max-Age=0' in response.headers['set-cookie']
    assert 'labnote_session' not in client.cookies
    client.cookies.set('labnote_session', token)
    assert client.get('/api/auth/session').status_code == 401
    assert count(client, 'sessions') == 0


def test_non_ascii_csrf_returns_forbidden_instead_of_internal_error(client):
    register(client)
    response = client.post('/api/auth/logout', headers={b'X-CSRF-Token': b'\xe9'})
    assert response.status_code == 403
    assert client.get('/api/auth/session').status_code == 200


@pytest.mark.parametrize('password', ['p' * 8, 'p' * 129, 'abc defghi', 'abcdefghi ',
                                      ' abcdefghi', 'abcd\tefghi', 'abcd\nefghi', 'abcd\u00a0efghi'])
def test_invalid_password_never_reflected_in_validation_response(client, password):
    result = register(client, password=password)
    assert result.status_code == 422
    assert password not in result.text and 'input' not in result.text and 'ctx' not in result.text
    assert count(client, 'users') == 0


@pytest.mark.parametrize('password', ['p' * 9, 'p' * 128])
def test_registration_accepts_password_length_boundaries_and_login(client, password):
    assert register(client, password=password).status_code == 201
    assert login(client, password=password).status_code == 200


def test_extra_nested_credentials_not_reflected_in_validation_response(client):
    response = client.post('/api/auth/register', json={'name': 'X', 'email': 'x@example.test',
        'password': PASSWORD, 'unexpected': {'password': 'must-never-be-reflected'}})
    assert response.status_code == 422
    assert PASSWORD not in response.text and 'must-never-be-reflected' not in response.text


@pytest.mark.parametrize('email', ['missing-at.test', 'a@@b.test', '.a@b.test', 'a..b@b.test',
                                  'a@-invalid.test', 'a@b', 'a@b..test', 'a b@example.test'])
def test_email_validation_rejects_invalid_addresses(client, email):
    assert register(client, email=email).status_code == 422


def test_bounded_login_throttle_persists_restart_and_ignores_forwarded_headers(client, monkeypatch):
    assert register(client).status_code == 201
    for number in range(5):
        response = client.post('/api/auth/login', json={'email': 'researcher@example.test', 'password': 'incorrect'},
                               headers={'X-Forwarded-For': f'198.51.100.{number}'})
        assert response.status_code == 401
    restarted = TestClient(create_app(client.app.state.db_path))
    limited = login(restarted)
    assert limited.status_code == 429
    assert 0 < int(limited.headers['retry-after']) <= 900
    # Limits are source + email, never a global account lockout an attacker can inflict.
    another_source = TestClient(client.app, client=('198.51.100.200', 50000))
    assert login(another_source).status_code == 200
    now = int(service.time.time())
    monkeypatch.setattr(service.time, 'time', lambda: now + 901)
    assert login(restarted).status_code == 200


def test_same_origin_checks_and_json_boundary_precede_authentication(client):
    body = {'email': 'nobody@example.test', 'password': 'incorrect'}
    for headers in ({'Origin': 'https://evil.test'}, {'Origin': 'null'}, {'Sec-Fetch-Site': 'cross-site'},
                    {'Origin': 'http://testserver', 'Sec-Fetch-Site': 'same-site'}):
        assert client.post('/api/auth/login', json=body, headers=headers).status_code == 403
    assert count(client, 'auth_rate_limits') == 0
    assert client.post('/api/auth/login', data='email=nobody').status_code == 415
    assert client.post('/api/auth/login', json=body,
        headers={'Origin': 'http://testserver', 'Sec-Fetch-Site': 'same-origin'}).status_code == 401


def test_secure_cookie_for_https_and_explicit_env(client, monkeypatch):
    secure = TestClient(client.app, base_url='https://testserver')
    response = register(secure)
    assert response.status_code == 201 and 'Secure' in response.headers['set-cookie']
    monkeypatch.setenv('LAB_COOKIE_SECURE', '1')
    response = login(client)
    assert response.status_code == 200 and 'Secure' in response.headers['set-cookie']


def test_local_provisioning_preserves_identity_and_rejects_invalid_links(client):
    with client.app.state.database.transaction() as db:
        author = dict(db.execute('SELECT * FROM authors WHERE id=1').fetchone())
    user = provision_user(client.app.state.database, email='Author@EXAMPLE.test', password=PASSWORD, author_id=1)
    assert user.author_id == 1 and user.name == author['name'] and user.email == 'author@example.test'
    assert login(client, email=user.email).status_code == 200
    with pytest.raises(RegistrationConflict):
        provision_user(client.app.state.database, email='different@example.test', password=PASSWORD, author_id=1)
    with pytest.raises(InvalidAccount):
        provision_user(client.app.state.database, email='missing@example.test', password=PASSWORD, author_id=999)
    assert count(client, 'users') == 1 and count(client, 'authors') == 2


@pytest.mark.parametrize('password', ['p' * 8, 'p' * 129, 'abcd efghi'])
def test_local_provisioning_enforces_new_password_policy_atomically(client, password):
    with pytest.raises(ValidationError):
        provision_user(client.app.state.database, email='author@example.test', password=password, author_id=1)
    assert count(client, 'users') == 0 and count(client, 'sessions') == 0


def test_cli_prompts_password_and_links_existing_author(client, monkeypatch, capsys):
    monkeypatch.setenv('LAB_DB', str(client.app.state.db_path))
    monkeypatch.setattr('sys.argv', ['manage_users', 'create', '--email', 'cli@example.test', '--author-id', '2'])
    prompts = []
    def prompt(label):
        prompts.append(label)
        return PASSWORD
    monkeypatch.setattr(manage_users.getpass, 'getpass', prompt)
    assert manage_users.main() == 0
    output = capsys.readouterr().out
    assert len(prompts) == 2 and PASSWORD not in output and 'cli@example.test' in output
    assert login(client, email='cli@example.test').json()['user']['author_id'] == 2
