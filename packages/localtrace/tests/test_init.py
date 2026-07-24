"""init()/shutdown() lifecycle: no-crash guarantees, re-init, atexit flush."""
import subprocess
import sys

import localtrace

from helpers import read_records


def test_init_with_no_frameworks(tmp_path):
    localtrace.init(project="p", log_dir=tmp_path, frameworks="none")
    with localtrace.span("s", kind="CHAIN"):
        pass
    localtrace.shutdown()
    assert len(read_records(tmp_path)) == 1


def test_init_auto_never_crashes(tmp_path):
    # With zero (or any) AI libs installed this must not raise.
    localtrace.init(project="p", log_dir=tmp_path, frameworks="auto")
    localtrace.shutdown()


def test_unknown_framework_warns_but_works(tmp_path):
    localtrace.init(project="p", log_dir=tmp_path, frameworks=["definitely-not-a-thing"])
    with localtrace.span("s", kind="CHAIN"):
        pass
    localtrace.shutdown()
    assert len(read_records(tmp_path)) == 1


def test_reinit_switches_log_dir(tmp_path):
    first, second = tmp_path / "one", tmp_path / "two"
    localtrace.init(project="p", log_dir=first, frameworks="none")
    with localtrace.span("in-first", kind="CHAIN"):
        pass
    localtrace.init(project="p", log_dir=second, frameworks="none")
    with localtrace.span("in-second", kind="CHAIN"):
        pass
    localtrace.shutdown()
    assert [r["name"] for r in read_records(first)] == ["in-first"]
    assert [r["name"] for r in read_records(second)] == ["in-second"]


def test_session_context_manager(tmp_path):
    with localtrace.session(project="p", log_dir=tmp_path, frameworks="none"):
        with localtrace.span("inside", kind="CHAIN"):
            pass
    assert len(read_records(tmp_path)) == 1


def test_atexit_flushes_without_explicit_shutdown(tmp_path):
    # Simulates "process ends right after a call": no flush(), no shutdown().
    script = (
        "import localtrace\n"
        f"localtrace.init(project='atexit-test', log_dir=r'{tmp_path}', frameworks='none')\n"
        "with localtrace.span('final-span', kind='CHAIN'):\n"
        "    pass\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", script], capture_output=True, text=True, timeout=120
    )
    assert result.returncode == 0, result.stderr
    records = read_records(tmp_path)
    assert [r["name"] for r in records] == ["final-span"]
