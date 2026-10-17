"""One-command local setup and launch on Windows, macOS and Linux."""
import argparse
from pathlib import Path
import shutil
import subprocess
import sys
import venv

ROOT = Path(__file__).resolve().parents[1]
MINIMUM_PYTHON = (3, 11)


def run(args, cwd=ROOT):
    subprocess.run([str(a) for a in args], cwd=cwd, check=True)


def main():
    parser = argparse.ArgumentParser(description='Общий лабораторный журнал')
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', default=8000, type=int)
    args = parser.parse_args()
    if sys.version_info < MINIMUM_PYTHON:
        raise SystemExit('Требуется Python 3.11+. Повторите запуск с новой версией Python.')
    npm = shutil.which('npm.cmd' if sys.platform == 'win32' else 'npm')
    if not npm:
        raise SystemExit('Требуется Node.js 22.13+ с npm. Установите его и повторите запуск.')
    python = ROOT / '.venv' / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
    if not python.exists():
        venv.create(ROOT / '.venv', with_pip=True)
    environment_version = subprocess.check_output(
        [str(python), '-c', 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'],
        text=True,
    ).strip()
    if tuple(map(int, environment_version.split('.'))) < MINIMUM_PYTHON:
        raise SystemExit(f'Окружение .venv использует Python {environment_version}; требуется 3.11+. Пересоздайте .venv подходящим Python и повторите запуск.')
    run([python, '-m', 'pip', 'install', '-r', 'requirements.lock.txt'])
    if not (ROOT / 'frontend/node_modules').exists():
        run([npm, 'ci', '--no-audit', '--no-fund'], ROOT / 'frontend')
    run([npm, 'run', 'build'], ROOT / 'frontend')
    print(f'\nPersonalJournal: http://{args.host}:{args.port}\nОстановка: Ctrl+C\n', flush=True)
    run([python, '-m', 'uvicorn', 'backend.app:create_app', '--factory', '--host', args.host, '--port', args.port])


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        pass
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.returncode)
