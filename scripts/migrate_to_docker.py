"""Copy a stopped native journal into an empty Docker Compose data volume.

Stop the native server before running this script. The SQLite backup includes
committed WAL data, but this script does not lock out native writers.
"""

import argparse
from contextlib import closing
from datetime import datetime, timezone
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / 'data' / 'journal.sqlite3'

# No mount of the source directory: only the completed SQLite snapshot crosses
# stdin. Exclusive creation prevents replacing any existing container journal.
CONTAINER_IMPORT = '''
from contextlib import closing
import os
from pathlib import Path
import shutil
import sqlite3
import sys

target = Path('/app/data/journal.sqlite3')
if any(os.path.lexists(str(target) + suffix) for suffix in ('', '-wal', '-shm', '-journal')):
    raise SystemExit('Import refused: the Docker volume already contains a journal or SQLite sidecar.')
created = False
try:
    stream = target.open('xb')
    created = True
    with stream:
        shutil.copyfileobj(sys.stdin.buffer, stream)
        stream.flush()
        os.fsync(stream.fileno())
    with closing(sqlite3.connect(target.as_uri() + '?mode=ro&immutable=1', uri=True)) as database:
        if database.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
            raise ValueError('Imported SQLite snapshot failed integrity_check.')
        if database.execute('PRAGMA foreign_key_check').fetchone() is not None:
            raise ValueError('Imported SQLite snapshot has broken foreign keys.')
except BaseException:
    if created:
        target.unlink(missing_ok=True)
    raise
print('Journal imported into /app/data/journal.sqlite3.')
'''


def validate_database(database: sqlite3.Connection) -> None:
    if database.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
        raise ValueError('База SQLite не прошла проверку целостности.')
    if database.execute('PRAGMA foreign_key_check').fetchone() is not None:
        raise ValueError('В базе SQLite найдены нарушенные внешние связи.')


def create_snapshot(source: Path, backup_directory: Path) -> Path:
    if not source.is_file():
        raise ValueError(f'Файл базы не найден: {source}')

    # mode=ro prevents a typo in the source path from creating a new database.
    with closing(sqlite3.connect(source.resolve().as_uri() + '?mode=ro', uri=True)) as database:
        validate_database(database)
        backup_directory.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%fZ-')
        descriptor, filename = tempfile.mkstemp(
            prefix=f'before-docker-{timestamp}', suffix='.sqlite3', dir=backup_directory,
        )
        os.close(descriptor)
        snapshot = Path(filename)
        with closing(sqlite3.connect(snapshot)) as backup:
            database.backup(backup)
            validate_database(backup)
    return snapshot


def migrate(source: Path) -> Path:
    if not source.is_file():
        raise ValueError(f'Файл базы не найден: {source}')
    # Reject a damaged source before making any Docker calls.
    with closing(sqlite3.connect(source.resolve().as_uri() + '?mode=ro', uri=True)) as database:
        validate_database(database)

    containers = subprocess.run(
        ['docker', 'compose', 'ps', '--all', '--format', '{{.Service}} {{.State}}'],
        cwd=ROOT, check=True, capture_output=True, text=True,
    )
    states = [line.split() for line in containers.stdout.splitlines() if line.strip()]
    if any(len(state) != 2 for state in states):
        raise ValueError('Не удалось проверить состояние контейнеров Docker Compose.')
    if any(service == 'app' and state != 'exited' for service, state in states):
        raise ValueError('Сначала остановите сервис app: docker compose stop app.')

    snapshot = create_snapshot(source, ROOT / 'data' / 'backups')
    print(f'Резервная копия: {snapshot}', flush=True)
    subprocess.run(
        ['docker', 'compose', 'run', '--rm', '--no-deps', '-T', '--entrypoint',
         'python', 'app', '-c', CONTAINER_IMPORT],
        cwd=ROOT, input=snapshot.read_bytes(), check=True,
    )
    return snapshot


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Перенос SQLite в пустой volume Docker Compose без перезаписи данных.',
        epilog='Перед переносом остановите native-сервер и выполните docker compose build. '
               'Скрипт не блокирует запись из native-сервера и не запускает приложение.',
    )
    parser.add_argument('source', nargs='?', type=Path, default=DEFAULT_SOURCE,
                        help='Путь к исходной SQLite (по умолчанию: data/journal.sqlite3).')
    args = parser.parse_args()
    print('Условие переноса: native-сервер должен быть остановлен. '
          'Скрипт не останавливает его и не блокирует новые записи.', flush=True)
    migrate(args.source.resolve())
    print('Перенос завершён. Исходная база и резервная копия сохранены. '
          'Запуск: docker compose up -d', flush=True)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, sqlite3.Error, subprocess.CalledProcessError) as error:
        print(f'Перенос не выполнен: {error}', file=sys.stderr)
        raise SystemExit(1)
