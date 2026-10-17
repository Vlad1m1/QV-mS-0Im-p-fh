"""The standalone API keeps journal behavior without serving a stale frontend build."""
from fastapi.testclient import TestClient
import pytest

from backend import app as app_module


@pytest.fixture
def frontend_dist(tmp_path, monkeypatch):
    dist = tmp_path / 'frontend' / 'dist'
    (dist / 'assets').mkdir(parents=True)
    (dist / 'index.html').write_text('<html>combined frontend</html>', encoding='utf-8')
    (dist / 'favicon.svg').write_text('<svg></svg>', encoding='utf-8')
    (dist / 'assets' / 'app.js').write_text('const combined = true;', encoding='utf-8')
    monkeypatch.setattr(app_module, 'ROOT', tmp_path)
    return dist


def test_api_only_disables_existing_frontend_but_preserves_auth_and_journal(tmp_path, frontend_dist):
    with TestClient(app_module.create_app(tmp_path / 'api.sqlite3', serve_frontend=False)) as client:
        for path in ('/', '/favicon.svg', '/assets/app.js'):
            assert client.get(path).status_code == 404
        assert client.get('/api/health').json() == {'status': 'ok'}
        assert client.get('/api/experiments').status_code == 401

        registered = client.post('/api/auth/register', json={
            'name': 'Проверка отдельного API', 'email': 'api-mode@example.test',
            'password': 'separate-API-regression-password',
        })
        assert registered.status_code == 201, registered.text
        client.headers['X-CSRF-Token'] = registered.json()['csrf_token']
        assert client.get('/api/auth/session').json() == registered.json()
        created = client.post('/api/experiments', json={
            'title': 'Проверка API без статики', 'objective': 'Сохранение доступно из dev-интерфейса',
            'date': '2026-10-17', 'work_mode': 'solo',
        })
        assert created.status_code == 201, created.text
        assert client.get('/api/experiments').json()[0]['id'] == created.json()['id']


def test_default_combined_mode_still_serves_frontend(tmp_path, frontend_dist):
    with TestClient(app_module.create_app(tmp_path / 'combined.sqlite3')) as client:
        assert client.get('/').text == '<html>combined frontend</html>'
        assert client.get('/favicon.svg').text == '<svg></svg>'
        assert client.get('/assets/app.js').text == 'const combined = true;'
        assert client.get('/api/health').json() == {'status': 'ok'}


def test_api_factory_uses_configured_database_and_never_mounts_frontend(tmp_path, frontend_dist, monkeypatch):
    database_path = tmp_path / 'configured.sqlite3'
    monkeypatch.setenv('LAB_DB', str(database_path))
    with TestClient(app_module.create_api_app()) as client:
        assert client.app.state.db_path == database_path
        assert client.get('/api/health').status_code == 200
        assert client.get('/').status_code == 404
        assert client.get('/assets/app.js').status_code == 404


@pytest.mark.parametrize('serve_frontend', [True, False])
def test_removed_report_server_has_no_routes_and_authentication_still_works(
    tmp_path, frontend_dist, serve_frontend,
):
    with TestClient(app_module.create_app(
        tmp_path / 'react-summary.sqlite3', serve_frontend=serve_frontend,
    )) as client:
        removed_paths = (
            '/reports/', '/reports/_stcore/stream', '/report-assets/style.css',
            '/api/experiments/1/summary/status',
        )
        for path in removed_paths:
            assert client.get(path).status_code == 404

        registered = client.post('/api/auth/register', json={
            'name': 'Проверка сводки React', 'email': 'react-summary@example.test',
            'password': 'react-summary-regression-password',
        })
        assert registered.status_code == 201, registered.text
        assert client.get('/api/auth/session').json() == registered.json()
        assert client.get('/api/experiments').json() == []
        for path in removed_paths:
            assert client.get(path).status_code == 404
