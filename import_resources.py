import pandas as pd
import sqlite3
import json
import os
import re

def parse_experience(exp_val):
    if pd.isna(exp_val):
        return 0.0
    exp_str = str(exp_val).lower().strip()
    # Extract numeric values (e.g., "3.10 yrs" -> 3.10, "20+ yrs" -> 20.0, "0.5" -> 0.5)
    match = re.search(r"([0-9.]+)", exp_str)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            pass
    return 0.0

def import_resources():
    excel_file = "Team Details (1).xlsx"
    db_path = os.path.join("services", "source.db")
    
    if not os.path.exists(excel_file):
        print(f"Excel file '{excel_file}' not found.")
        return
    if not os.path.exists(db_path):
        print(f"Database '{db_path}' not found.")
        return

    # Load sheet starting from the row that defines headers
    df = pd.read_excel(excel_file, sheet_name="Team Details", header=1)
    df.columns = [str(c).strip() for c in df.columns]
    
    # Filter rows that have a valid Name and Emp ID
    df = df[df["Name"].notna() & df["Emp ID"].notna()]
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    success_count = 0
    for _, row in df.iterrows():
        try:
            emp_id_raw = row["Emp ID"]
            emp_id_int = int(float(emp_id_raw))
            employee_id = f"EMP-{emp_id_int}"
            
            employee_name = str(row["Name"]).strip()
            
            # Map role, fallback if empty
            role = str(row.get("Role", "Developer")).strip()
            if not role or role == "nan":
                role = "Developer"
                
            # Map email, fallback
            email = str(row.get("email ID", "")).strip()
            if not email or email == "nan":
                email = f"{employee_name.lower().replace(' ', '.')}@example.com"
                
            # Parse skillset
            skills_raw = str(row.get("SkillSet", ""))
            skills_list = [s.strip() for s in skills_raw.split(",") if s.strip() and s.lower() != "nan"]
            skills_json = json.dumps(skills_list)
            
            # Take first skill as main skill
            main_skill = skills_list[0] if skills_list else "General IT"
            
            experience = parse_experience(row.get("Yrs Of Exp"))
            
            cursor.execute('''
                INSERT OR REPLACE INTO resources (
                    employee_id, employee_name, email, role, skill, skills, 
                    experience, department, status, allocated, allocation_percentage
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                employee_id,
                employee_name,
                email,
                role,
                main_skill,
                skills_json,
                experience,
                "Engineering",
                "Available",
                0,
                0.0
            ))
            success_count += 1
        except Exception as e:
            print(f"Error importing row: {e}")
            
    conn.commit()
    conn.close()
    print(f"Imported {success_count} resources from Excel into the database.")

if __name__ == "__main__":
    import_resources()
