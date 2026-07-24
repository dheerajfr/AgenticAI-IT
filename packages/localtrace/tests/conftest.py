import pytest

import localtrace


@pytest.fixture(autouse=True)
def _teardown_localtrace():
    """Every test gets a clean slate: flush/close the provider and session."""
    yield
    localtrace.shutdown()
    localtrace.clear_session()
