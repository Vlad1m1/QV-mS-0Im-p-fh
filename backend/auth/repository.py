import sqlite3

from backend.auth.models import Session, User


class AuthRepository:
    def __init__(self, db: sqlite3.Connection) -> None:
        self.db = db

    def account(self, email: str) -> sqlite3.Row | None:
        return self.db.execute(
            'SELECT u.*, a.name FROM users u JOIN authors a ON a.id=u.author_id WHERE u.email=?',
            (email,),
        ).fetchone()

    def author(self, author_id: int) -> sqlite3.Row | None:
        return self.db.execute('SELECT * FROM authors WHERE id=?', (author_id,)).fetchone()

    def add_author(self, name: str) -> int:
        return self.db.execute('INSERT INTO authors(name) VALUES(?)', (name,)).lastrowid

    def add_account(self, email: str, password_hash: str, author_id: int, stamp: str) -> User:
        uid = self.db.execute(
            'INSERT INTO users(email,password_hash,author_id,created_at) VALUES(?,?,?,?)',
            (email, password_hash, author_id, stamp),
        ).lastrowid
        return User(uid, author_id, self.author(author_id)['name'], email)

    def update_password_hash(self, user_id: int, password_hash: str) -> None:
        self.db.execute('UPDATE users SET password_hash=? WHERE id=?', (password_hash, user_id))

    def session(self, token_hash: str, now: int) -> Session | None:
        row = self.db.execute(
            'SELECT u.id,u.author_id,u.email,a.name,s.csrf_token,s.expires_at '
            'FROM sessions s JOIN users u ON u.id=s.user_id JOIN authors a ON a.id=u.author_id '
            'WHERE s.token_hash=? AND s.expires_at>?', (token_hash, now),
        ).fetchone()
        if row is None:
            return None
        return Session(User(row['id'], row['author_id'], row['name'], row['email']),
                       row['csrf_token'], row['expires_at'])

    def add_session(self, token_hash: str, user_id: int, csrf_token: str, now: int, expires_at: int) -> None:
        self.db.execute('DELETE FROM sessions WHERE expires_at<=?', (now,))
        self.db.execute('INSERT INTO sessions VALUES(?,?,?,?,?)',
                        (token_hash, user_id, csrf_token, now, expires_at))

    def revoke(self, token_hash: str) -> None:
        self.db.execute('DELETE FROM sessions WHERE token_hash=?', (token_hash,))

    def consume_limits(self, limits: list[tuple[str, int, int]], now: int) -> int | None:
        """Caller holds BEGIN IMMEDIATE so concurrent attempts cannot skip a limit."""
        wait = 0
        for bucket, maximum, duration in limits:
            row = self.db.execute('SELECT * FROM auth_rate_limits WHERE bucket=?', (bucket,)).fetchone()
            if row is not None and now < row['window_start'] + duration and row['attempts'] >= maximum:
                wait = max(wait, row['window_start'] + duration - now)
        if wait:
            return wait
        # All configured windows are <= one hour. Bound expired record growth.
        self.db.execute('DELETE FROM auth_rate_limits WHERE window_start<=?', (now - 3600,))
        for bucket, _maximum, duration in limits:
            self.db.execute(
                'INSERT INTO auth_rate_limits VALUES(?,?,1) '
                'ON CONFLICT(bucket) DO UPDATE SET '
                'attempts=CASE WHEN window_start+?<=? THEN 1 ELSE attempts+1 END, '
                'window_start=CASE WHEN window_start+?<=? THEN ? ELSE window_start END',
                (bucket, now, duration, now, duration, now, now),
            )
        return None

    def clear_limit(self, bucket: str) -> None:
        self.db.execute('DELETE FROM auth_rate_limits WHERE bucket=?', (bucket,))
