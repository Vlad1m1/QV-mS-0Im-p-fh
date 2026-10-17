import argparse
import getpass

from pydantic import ValidationError

from backend.auth.errors import AuthError
from backend.auth.service import provision_user
from backend.database import Database


def main() -> int:
    parser = argparse.ArgumentParser(description='Управление аккаунтами лабораторного журнала')
    commands = parser.add_subparsers(dest='command', required=True)
    create = commands.add_parser('create', help='Привязать аккаунт к существующему участнику')
    create.add_argument('--email', required=True)
    create.add_argument('--author-id', type=int, required=True)
    args = parser.parse_args()
    password = getpass.getpass('Пароль (9–128 символов, без пробелов): ')
    confirmation = getpass.getpass('Повторите пароль: ')
    if password != confirmation:
        parser.exit(1, 'Пароли не совпадают. Аккаунт не создан.\n')
    database = Database.configured()
    database.initialize()
    try:
        user = provision_user(database, email=args.email, password=password, author_id=args.author_id)
    except ValidationError:
        parser.exit(1, 'Укажите корректный email и пароль длиной 9–128 символов без пробелов.\n')
    except AuthError as error:
        parser.exit(1, f'{error}\n')
    print(f'Аккаунт {user.email} привязан к участнику #{user.author_id}: {user.name}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
