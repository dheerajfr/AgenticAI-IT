import pytest
from database import db

def test_get_employees_by_role_mapping():
    # Test backend developer & senior architect -> backend
    backend_emps = db.get_employees_by_role("backend", only_available=False)
    backend_emails = [e["email"] for e in backend_emps]
    assert "john@example.com" in backend_emails
    assert "bob@example.com" in backend_emails
    assert "diana@example.com" in backend_emails
    assert "james@example.com" in backend_emails
    assert "alice@example.com" not in backend_emails

    # Test frontend -> frontend
    frontend_emps = db.get_employees_by_role("frontend", only_available=False)
    frontend_emails = [e["email"] for e in frontend_emps]
    assert "alice@example.com" in frontend_emails
    assert "john@example.com" not in frontend_emails

    # Test devops -> devops (security engineer is mapped as devops)
    devops_emps = db.get_employees_by_role("devops", only_available=False)
    devops_emails = [e["email"] for e in devops_emps]
    assert "charlie@example.com" in devops_emails
    assert "john@example.com" not in devops_emails
