from collections import defaultdict
import json
import sqlite3
from typing import Any, cast

from backend.errors import NotFound
from backend.models import (
    AttemptInput, AttemptRecord, AttemptVersion, Author, ExperimentDetail,
    ExperimentFilters, ExperimentInput, ExperimentRecord, ExperimentSummary,
    HistoryEvent, ParameterRecord,
)


class JournalRepository:
    def __init__(self, db: sqlite3.Connection) -> None:
        self.db = db

    def initialize_authors(self) -> None:
        self.db.executemany(
            'INSERT OR IGNORE INTO authors(id,name) VALUES(?,?)',
            [(1, 'Анна Петрова'), (2, 'Михаил Соколов')],
        )

    def has_experiments(self) -> bool:
        return self.db.execute('SELECT 1 FROM experiments LIMIT 1').fetchone() is not None

    def authors(self, actor_id: int) -> list[Author]:
        return [dict(row) for row in self.db.execute('''SELECT a.id,a.name FROM authors a
            WHERE a.id=? OR EXISTS (
                SELECT 1 FROM experiment_members mine JOIN experiment_members other
                    ON other.experiment_id=mine.experiment_id
                WHERE mine.author_id=? AND other.author_id=a.id
            ) ORDER BY a.id''', (actor_id, actor_id))]

    def author_exists(self, author_id: int) -> bool:
        return self.db.execute('SELECT 1 FROM authors WHERE id=?', (author_id,)).fetchone() is not None

    def experiment(self, experiment_id: int, actor_id: int | None = None) -> ExperimentRecord:
        condition = '' if actor_id is None else '''AND EXISTS (
            SELECT 1 FROM experiment_members m WHERE m.experiment_id=e.id AND m.author_id=?)'''
        arguments = (experiment_id,) if actor_id is None else (experiment_id, actor_id)
        row = self.db.execute(f'SELECT e.* FROM experiments e WHERE e.id=? {condition}', arguments).fetchone()
        if row is None:
            raise NotFound()
        return cast(ExperimentRecord, dict(row))

    def _participants(self, experiment_ids: list[int]) -> dict[int, list[Author]]:
        grouped: dict[int, list[Author]] = defaultdict(list)
        if not experiment_ids:
            return grouped
        placeholders = ','.join('?' for _ in experiment_ids)
        rows = self.db.execute(
            f'''SELECT m.experiment_id,a.id,a.name
                FROM experiment_members m JOIN authors a ON a.id=m.author_id
                JOIN experiments e ON e.id=m.experiment_id
                WHERE m.experiment_id IN ({placeholders})
                ORDER BY CASE WHEN a.id=e.author_id THEN 0 ELSE 1 END,a.id''',
            experiment_ids,
        )
        for row in rows:
            grouped[row['experiment_id']].append({'id': row['id'], 'name': row['name']})
        return grouped

    def experiments(self, filters: ExperimentFilters, actor_id: int | None = None) -> list[ExperimentSummary]:
        conditions: list[str] = []
        arguments: list[Any] = []
        joins = ''
        ctes = ''
        if actor_id is not None:
            conditions.append('EXISTS (SELECT 1 FROM experiment_members mine WHERE mine.experiment_id=e.id AND mine.author_id=?)')
            arguments.append(actor_id)
        if filters.date_from:
            conditions.append('e.date >= ?')
            arguments.append(str(filters.date_from))
        if filters.date_to:
            conditions.append('e.date <= ?')
            arguments.append(str(filters.date_to))
        if filters.author_id:
            conditions.append('EXISTS (SELECT 1 FROM events ev WHERE ev.experiment_id=e.id AND ev.author_id=?)')
            arguments.append(filters.author_id)
        if filters.q or filters.parameter:
            ctes = '''WITH current_versions AS (
                SELECT v.*,a.experiment_id,a.number FROM attempts a
                JOIN attempt_versions v ON v.attempt_id=a.id AND v.version=(
                    SELECT MAX(latest.version) FROM attempt_versions latest WHERE latest.attempt_id=a.id
                )
            ), parameter_text AS (
                SELECT experiment_id,group_concat(part,' ') AS text FROM (
                    SELECT v.experiment_id,m.name || ' ' || m.value || ' ' || m.unit AS part
                    FROM current_versions v JOIN measurements m ON m.version_id=v.id
                    ORDER BY v.experiment_id,v.number,m.position
                ) GROUP BY experiment_id
            ), result_text AS (
                SELECT experiment_id,group_concat(part,' ') AS text FROM (
                    SELECT experiment_id,result_name || ' ' || result_value || ' ' || result_unit || ' ' || note AS part
                    FROM current_versions ORDER BY experiment_id,number
                ) GROUP BY experiment_id
            ), participant_text AS (
                SELECT experiment_id,group_concat(name,' ') AS text FROM (
                    SELECT DISTINCT ev.experiment_id,a.id,a.name FROM events ev JOIN authors a ON a.id=ev.author_id
                    ORDER BY ev.experiment_id,a.id
                ) GROUP BY experiment_id
            )'''
            joins = 'LEFT JOIN parameter_text p ON p.experiment_id=e.id'
        if filters.q:
            joins += ' LEFT JOIN result_text r ON r.experiment_id=e.id LEFT JOIN participant_text people ON people.experiment_id=e.id'
            conditions.append('''instr(search_text(e.title || ' ' || e.objective || ' ' ||
                COALESCE(p.text,'') || ' ' || COALESCE(r.text,'') || ' ' || COALESCE(people.text,'')), search_text(?)) > 0''')
            arguments.append(filters.q)
        if filters.parameter:
            conditions.append("instr(search_text(COALESCE(p.text,'')), search_text(?)) > 0")
            arguments.append(filters.parameter)
        where = 'WHERE ' + ' AND '.join(conditions) if conditions else ''
        rows = self.db.execute(
            f'''{ctes} SELECT e.*,a.name AS author,
                (SELECT COUNT(*) FROM attempts t WHERE t.experiment_id=e.id) AS attempt_count,
                (SELECT COUNT(*) FROM events ev WHERE ev.experiment_id=e.id) AS event_count
                FROM experiments e JOIN authors a ON a.id=e.author_id {joins} {where}
                ORDER BY e.created_at DESC,e.id DESC''',
            arguments,
        ).fetchall()
        participants = self._participants([row['id'] for row in rows])
        return [cast(ExperimentSummary, {**dict(row), 'participants': participants[row['id']]}) for row in rows]

    def _attempts(self, clause: str, record_id: int) -> list[AttemptRecord]:
        attempts = [dict(row) for row in self.db.execute(
            f'''SELECT t.*,a.name AS author FROM attempts t JOIN authors a ON a.id=t.author_id
                WHERE {clause} ORDER BY t.number''', (record_id,),
        )]
        if not attempts:
            return []
        versions = [dict(row) for row in self.db.execute(
            f'''SELECT v.*,a.name AS author FROM attempt_versions v
                JOIN attempts t ON t.id=v.attempt_id JOIN authors a ON a.id=v.author_id
                WHERE {clause} ORDER BY t.number,v.version''', (record_id,),
        )]
        parameters: dict[int, list[ParameterRecord]] = defaultdict(list)
        for row in self.db.execute(
            f'''SELECT m.version_id,m.name,m.value,m.unit FROM measurements m
                JOIN attempt_versions v ON v.id=m.version_id JOIN attempts t ON t.id=v.attempt_id
                WHERE {clause} ORDER BY m.version_id,m.position''', (record_id,),
        ):
            parameters[row['version_id']].append({'name': row['name'], 'value': row['value'], 'unit': row['unit']})
        by_attempt: dict[int, list[AttemptVersion]] = defaultdict(list)
        for version in versions:
            version['parameters'] = parameters[version['id']]
            by_attempt[version['attempt_id']].append(cast(AttemptVersion, version))
        return [cast(AttemptRecord, {
            **attempt, 'versions': by_attempt[attempt['id']], 'current': by_attempt[attempt['id']][-1],
        }) for attempt in attempts]

    def attempt(self, attempt_id: int) -> AttemptRecord:
        rows = self._attempts('t.id=?', attempt_id)
        if not rows:
            raise NotFound()
        return rows[0]

    def check_attempt_access(self, attempt_id: int, actor_id: int) -> None:
        row = self.db.execute('''SELECT t.experiment_id FROM attempts t
            JOIN experiment_members m ON m.experiment_id=t.experiment_id
            WHERE t.id=? AND m.author_id=?''', (attempt_id, actor_id)).fetchone()
        if row is None:
            raise NotFound()

    def history(self, experiment_id: int) -> list[HistoryEvent]:
        events = []
        for row in self.db.execute(
            '''SELECT e.*,a.name AS author FROM events e JOIN authors a ON a.id=e.author_id
               WHERE e.experiment_id=? ORDER BY e.id DESC''', (experiment_id,),
        ):
            event = dict(row)
            event['before'] = json.loads(event.pop('before_json') or 'null')
            event['after'] = json.loads(event.pop('after_json') or 'null')
            events.append(cast(HistoryEvent, event))
        return events

    def detail(self, experiment_id: int, actor_id: int | None = None) -> ExperimentDetail:
        experiment = self.experiment(experiment_id, actor_id)
        author = self.db.execute('SELECT name FROM authors WHERE id=?', (experiment['author_id'],)).fetchone()
        return cast(ExperimentDetail, {
            **experiment, 'author': author['name'],
            'attempts': self._attempts('t.experiment_id=?', experiment_id),
            'history': self.history(experiment_id),
            'participants': self._participants([experiment_id])[experiment_id],
        })

    def collaborator_ids(self, emails: list[str]) -> list[int]:
        if not emails:
            return []
        placeholders = ','.join('?' for _ in emails)
        rows = self.db.execute(f'SELECT email,author_id FROM users WHERE email IN ({placeholders})', emails)
        found = {row['email']: row['author_id'] for row in rows}
        return [found[email] for email in emails if email in found]

    def create_experiment(self, payload: ExperimentInput, stamp: str, collaborator_ids: list[int]) -> ExperimentRecord:
        row = self.db.execute('SELECT next_number FROM experiment_sequences WHERE author_id=?', (payload.author_id,)).fetchone()
        number = row['next_number'] if row else 1
        self.db.execute('''INSERT INTO experiment_sequences(author_id,next_number) VALUES(?,?)
            ON CONFLICT(author_id) DO UPDATE SET next_number=excluded.next_number''', (payload.author_id, number + 1))
        cursor = self.db.execute(
            'INSERT INTO experiments(title,objective,date,author_id,created_at,number,work_mode) VALUES(?,?,?,?,?,?,?)',
            (payload.title, payload.objective, str(payload.date), payload.author_id, stamp, number, payload.work_mode),
        )
        self.db.executemany('INSERT INTO experiment_members(experiment_id,author_id) VALUES(?,?)',
                            [(cursor.lastrowid, author_id) for author_id in [payload.author_id, *collaborator_ids]])
        return self.experiment(cursor.lastrowid)

    def update_experiment(self, experiment_id: int, payload: ExperimentInput) -> ExperimentRecord:
        self.db.execute(
            'UPDATE experiments SET title=?,objective=?,date=?,version=version+1 WHERE id=?',
            (payload.title, payload.objective, str(payload.date), experiment_id),
        )
        return self.experiment(experiment_id)

    def create_attempt(self, experiment_id: int, author_id: int, stamp: str) -> int:
        number = self.db.execute(
            'SELECT COALESCE(MAX(number),0)+1 FROM attempts WHERE experiment_id=?', (experiment_id,),
        ).fetchone()[0]
        cursor = self.db.execute(
            'INSERT INTO attempts(experiment_id,number,author_id,created_at) VALUES(?,?,?,?)',
            (experiment_id, number, author_id, stamp),
        )
        return cursor.lastrowid

    def create_version(self, attempt_id: int, payload: AttemptInput, version: int, stamp: str, reason: str) -> None:
        cursor = self.db.execute(
            '''INSERT INTO attempt_versions(attempt_id,version,result_name,result_value,result_unit,note,author_id,created_at,reason)
               VALUES(?,?,?,?,?,?,?,?,?)''',
            (attempt_id, version, payload.result_name, payload.result_value, payload.result_unit,
             payload.note, payload.author_id, stamp, reason),
        )
        self.db.executemany(
            'INSERT INTO measurements(version_id,position,name,value,unit) VALUES(?,?,?,?,?)',
            [(cursor.lastrowid, position, p.name, p.value, p.unit) for position, p in enumerate(payload.parameters)],
        )

    def add_event(self, experiment_id: int, author_id: int, kind: str, content: str, stamp: str,
                  *, before: dict[str, Any] | None = None, after: dict[str, Any] | None = None,
                  attempt_id: int | None = None) -> None:
        self.db.execute(
            '''INSERT INTO events(experiment_id,attempt_id,kind,author_id,created_at,content,before_json,after_json)
               VALUES(?,?,?,?,?,?,?,?)''',
            (experiment_id, attempt_id, kind, author_id, stamp, content,
             json.dumps(before, ensure_ascii=False, default=str) if before is not None else None,
             json.dumps(after, ensure_ascii=False, default=str) if after is not None else None),
        )
