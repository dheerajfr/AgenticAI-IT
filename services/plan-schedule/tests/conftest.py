import pytest
import sys
import os
import json

# Ensure services directory is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from database import db
from shared_db.connection import get_db

@pytest.fixture(autouse=True, scope="session")
def seed_mock_employees():
    mock_users = [
        ("john@example.com", "John Doe", "Backend Developer", "Python"),
        ("bob@example.com", "Bob Smith", "Backend Developer", "Java"),
        ("diana@example.com", "Diana Prince", "Backend Developer", "Go"),
        ("james@example.com", "James Bond", "Backend Developer", "C++"),
        ("alice@example.com", "Alice Cooper", "Frontend Developer", "React"),
        ("charlie@example.com", "Charlie Brown", "Security Engineer", "DevOps")
    ]
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Insert mock users
        for email, name, role, skill in mock_users:
            emp_id = f"MOCK-{email.split('@')[0]}"
            cursor.execute(
                "INSERT OR REPLACE INTO resources (employee_id, employee_name, email, role, skill, skills, experience, department, status, allocated, allocation_percentage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (emp_id, name, email, role, skill, json.dumps([skill]), 5.0, "Engineering", "Available", 0, 0.0)
            )
        conn.commit()
        
    yield
    
    # Cleanup mock users after tests complete
    with get_db() as conn:
        cursor = conn.cursor()
        for email, _, _, _ in mock_users:
            cursor.execute("DELETE FROM resources WHERE email = ?", (email,))
        conn.commit()
