"""`knowledge-portal import`: arguments, output and exit codes, without a database."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from knowledge_portal.application.errors import PersistenceError
from knowledge_portal.infrastructure.config.options import PersistenceProvider
from knowledge_portal.infrastructure.config.settings import PersistenceSettings
from knowledge_portal.infrastructure.persistence.knowledge_import import TableCheck, TableImport
from knowledge_portal.interfaces import cli

SOURCE = "postgresql://requirements.example.test/app"
TARGET = "postgresql://knowledge.example.test/app"


@pytest.fixture
def postgres(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = PersistenceSettings(provider=PersistenceProvider.POSTGRES, database_url=TARGET)
    monkeypatch.setattr(PersistenceSettings, "from_env", lambda: settings)


def _stub(
    monkeypatch: pytest.MonkeyPatch, checks: tuple[TableCheck, ...] = ()
) -> tuple[MagicMock, MagicMock]:
    copy = MagicMock(return_value=(TableImport("library_documents", 2, 1),))
    verify = MagicMock(return_value=checks)
    monkeypatch.setattr(cli, "import_knowledge", copy)
    monkeypatch.setattr(cli, "verify_knowledge", verify)
    return copy, verify


@pytest.mark.usefixtures("postgres")
def test_import_copies_into_the_configured_database(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    copy, verify = _stub(monkeypatch)

    assert cli.main(["import", "--source-database-url", SOURCE]) == 0

    copy.assert_called_once_with(SOURCE, TARGET)
    verify.assert_not_called()
    assert "library_documents: 2 added, 1 updated" in capsys.readouterr().out


@pytest.mark.usefixtures("postgres")
def test_verify_fails_the_command_on_any_difference(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    checks = (
        TableCheck("library_documents", 2, 2, True),
        TableCheck("knowledge_events", 9, 8, False),
    )
    _stub(monkeypatch, checks)

    assert cli.main(["import", "--source-database-url", SOURCE, "--verify"]) == 1

    output = capsys.readouterr()
    assert "knowledge_events: DIFFERS (source 9, target 8)" in output.out
    assert "differs from the source" in output.err


@pytest.mark.usefixtures("postgres")
def test_verify_only_compares_without_copying(monkeypatch: pytest.MonkeyPatch) -> None:
    copy, verify = _stub(monkeypatch, (TableCheck("library_documents", 1, 1, True),))

    assert cli.main(["import", "--source-database-url", SOURCE, "--verify-only"]) == 0

    copy.assert_not_called()
    verify.assert_called_once_with(SOURCE, TARGET)


def test_the_import_needs_a_postgresql_target(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(
        PersistenceSettings,
        "from_env",
        lambda: PersistenceSettings(provider=PersistenceProvider.MEMORY),
    )
    copy, _ = _stub(monkeypatch)

    assert cli.main(["import", "--source-database-url", SOURCE]) == 2

    copy.assert_not_called()
    assert "PERSISTENCE_PROVIDER=postgres" in capsys.readouterr().err


@pytest.mark.usefixtures("postgres")
def test_a_failed_import_is_reported_without_a_traceback(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(
        cli, "import_knowledge", MagicMock(side_effect=PersistenceError("target not migrated"))
    )

    assert cli.main(["import", "--source-database-url", SOURCE]) == 1

    assert "[import] target not migrated" in capsys.readouterr().err


def test_verify_and_verify_only_are_exclusive() -> None:
    with pytest.raises(SystemExit):
        cli.main(["import", "--source-database-url", SOURCE, "--verify", "--verify-only"])
