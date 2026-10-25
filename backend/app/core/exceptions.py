"""
backend/app/core/exceptions.py

Единое место для исключений приложения Jude.
"""


class JudeError(Exception):
    """Базовое исключение приложения."""

    pass


class NotFoundError(JudeError):
    """Ресурс не найден."""

    pass


class ValidationError(JudeError):
    """Ошибка валидации данных или геометрии."""

    pass


class ProcessingError(JudeError):
    """Ошибка обработки геометрии или внешних сервисов."""

    pass
