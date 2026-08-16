from __future__ import annotations

from typing import Any

import pytest

import sermon_evaluator.persistence as persistence_module
from sermon_evaluator.persistence import PsycopgPersistence, get_pool


class _Cursor:
    def __init__(self) -> None:
        self.executions: list[tuple[str, Any]] = []

    def __enter__(self) -> "_Cursor":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, query: str, params: Any = None) -> None:
        self.executions.append((" ".join(query.split()), params))


class _Connection:
    def __init__(self, cursor: _Cursor) -> None:
        self._cursor = cursor

    def __enter__(self) -> "_Connection":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def cursor(self) -> _Cursor:
        return self._cursor


class _Pool:
    def __init__(self, cursor: _Cursor) -> None:
        self._connection = _Connection(cursor)

    def connection(self) -> _Connection:
        return self._connection


def test_pool_does_not_send_statement_timeout_as_a_startup_option(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    class FakeConnectionPool:
        def __init__(self, **kwargs: Any) -> None:
            captured.update(kwargs)

        def open(self, *, wait: bool) -> None:
            captured["open_wait"] = wait

    monkeypatch.setattr(persistence_module, "_POOL", None)
    monkeypatch.setattr(persistence_module, "ConnectionPool", FakeConnectionPool)

    pool = get_pool(
        "postgresql://worker:secret@example-pooler.invalid/preview?sslmode=require"
    )

    assert isinstance(pool, FakeConnectionPool)
    assert captured["kwargs"] == {
        "autocommit": False,
        "row_factory": persistence_module.dict_row,
    }
    assert captured["open_wait"] is False


def test_persistence_applies_statement_timeout_inside_the_transaction() -> None:
    cursor = _Cursor()
    persistence = PsycopgPersistence(pool=_Pool(cursor))

    with persistence._connection():
        pass

    assert cursor.executions == [
        ("SET LOCAL statement_timeout = 30000", None),
    ]
