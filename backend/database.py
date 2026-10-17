from collections.abc import Iterator
from contextlib import AbstractContextManager, closing, contextmanager
from dataclasses import dataclass
import os
from pathlib import Path
import sqlite3
import time

ROOT = Path(__file__).resolve().parents[1]


def search_text(value: str) -> str:
    return value.casefold().replace(',', '.')


@contextmanager
def connection(path: Path, write: bool = False) -> Iterator[sqlite3.Connection]:
    db = sqlite3.connect(str(path), timeout=15)
    db.row_factory = sqlite3.Row
    db.create_function('search_text', 1, search_text, deterministic=True)
    db.execute('PRAGMA foreign_keys=ON')
    try:
        db.execute('BEGIN IMMEDIATE' if write else 'BEGIN')
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@dataclass(frozen=True)
class Database:
    path: Path

    @classmethod
    def configured(cls, path: str | Path | None = None) -> 'Database':
        return cls(Path(path or os.environ.get('LAB_DB', ROOT / 'data' / 'journal.sqlite3')))

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        deadline = time.monotonic() + 15
        while True:
            try:
                self._initialize_schema()
                return
            except sqlite3.OperationalError as error:
                code = getattr(error, 'sqlite_errorcode', 0) & 0xff
                remaining = deadline - time.monotonic()
                if code not in {sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED} or remaining <= 0:
                    raise
                time.sleep(min(0.1, remaining))

    def _initialize_schema(self) -> None:
        with closing(sqlite3.connect(self.path, timeout=15)) as db:
            if db.execute('PRAGMA journal_mode').fetchone()[0].casefold() != 'wal':
                db.execute('PRAGMA journal_mode=WAL')
            db.executescript((Path(__file__).parent / 'schema.sql').read_text(encoding='utf-8'))
            db.execute('BEGIN IMMEDIATE')
            try:
                existing_columns = {row[1] for row in db.execute('PRAGMA table_info(experiments)')}
                self._migrate_access(db, existing_columns)
                db.commit()
            except Exception:
                db.rollback()
                raise

    @staticmethod
    def _migrate_access(db: sqlite3.Connection, old_columns: set[str]) -> None:
        legacy = bool(old_columns) and 'work_mode' not in old_columns
        if old_columns and 'number' not in old_columns:
            db.execute('ALTER TABLE experiments ADD COLUMN number INTEGER')
        if legacy:
            db.execute("ALTER TABLE experiments ADD COLUMN work_mode TEXT NOT NULL DEFAULT 'solo' CHECK(work_mode IN ('solo','shared'))")
        if old_columns and 'number' not in old_columns:
            db.execute('''WITH numbered AS (
                SELECT id,ROW_NUMBER() OVER (PARTITION BY author_id ORDER BY id) AS number FROM experiments
            ) UPDATE experiments SET number=(SELECT number FROM numbered WHERE numbered.id=experiments.id)''')
        if legacy:
            db.execute('INSERT OR IGNORE INTO experiment_members SELECT id,author_id FROM experiments')
            db.execute('INSERT OR IGNORE INTO experiment_members SELECT experiment_id,author_id FROM events')
            db.execute('INSERT OR IGNORE INTO experiment_members SELECT experiment_id,author_id FROM attempts')
            db.execute('''INSERT OR IGNORE INTO experiment_members
                SELECT t.experiment_id,v.author_id FROM attempt_versions v JOIN attempts t ON t.id=v.attempt_id''')
            db.execute("""UPDATE experiments SET work_mode='shared' WHERE
                (SELECT COUNT(*) FROM experiment_members m WHERE m.experiment_id=experiments.id)>1""")
        db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_experiment_number ON experiments(author_id,number)')
        db.execute('''INSERT INTO experiment_sequences(author_id,next_number)
            SELECT author_id,MAX(number)+1 FROM experiments GROUP BY author_id
            ON CONFLICT(author_id) DO UPDATE SET next_number=MAX(next_number,excluded.next_number)''')

    def transaction(self, *, write: bool = False) -> AbstractContextManager[sqlite3.Connection]:
        return connection(self.path, write)
