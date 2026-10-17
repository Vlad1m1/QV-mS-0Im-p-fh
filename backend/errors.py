"""Application failures, independent of the HTTP framework."""


class JournalError(Exception):
    pass


class NotFound(JournalError):
    def __init__(self) -> None:
        super().__init__('Запись не найдена')


class InvalidOperation(JournalError):
    pass


class VersionConflict(JournalError):
    pass
