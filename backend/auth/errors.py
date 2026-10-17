class AuthError(Exception):
    pass


class InvalidCredentials(AuthError):
    pass


class RegistrationConflict(AuthError):
    pass


class InvalidAccount(AuthError):
    pass


class NoSession(AuthError):
    pass


class RateLimited(AuthError):
    def __init__(self, retry_after: int) -> None:
        self.retry_after = retry_after
        super().__init__('Слишком много попыток. Попробуйте позднее.')
