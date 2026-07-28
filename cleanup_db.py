import sqlite3
import json
import os
import shutil

def cleanup():
    db_path = os.path.join("services", "source.db")
    if not os.path.exists(db_path):
        print(f"Database {db_path} not found.")
        return

    # 1. Create a backup first
    backup_path = db_path + ".bak"
    print(f"Creating database backup at {backup_path}...")
    shutil.copyfile(db_path, backup_path)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # --- PREVIEW PHASE ---
    print("\n--- PREVIEW OF CHANGES ---")

    # Preview budget_records to delete
    cursor.execute("SELECT COUNT(*) FROM budget_records")
    budget_count = cursor.fetchone()[0]
    print(f"budget_records: Will delete all {budget_count} rows (to force clean re-generation).")

    # Preview vendor_records containing vendor_contractor_1
    cursor.execute("SELECT id, demand_id, access_alerts FROM vendor_records")
    vendor_rows = cursor.fetchall()
    alerts_to_update = []
    for r in vendor_rows:
        alerts_str = r["access_alerts"]
        if alerts_str:
            try:
                alerts = json.loads(alerts_str)
                if isinstance(alerts, list) and any(a.get("user") == "vendor_contractor_1" for a in alerts):
                    alerts_to_update.append((r["id"], r["demand_id"]))
            except Exception:
                pass
    print(f"vendor_records: Will update {len(alerts_to_update)} rows to remove 'vendor_contractor_1' from access_alerts.")
    for rec_id, demand_id in alerts_to_update:
        print(f"  - Record ID: {rec_id}, Demand ID: {demand_id}")

    # Preview invoice_matches to delete
    cursor.execute(
        "SELECT id, demand_id, invoice_id, invoice_amount FROM invoice_matches WHERE (ai_analysis IS NULL OR ai_analysis = '') AND (decision IS NULL OR decision = '')"
    )
    invoice_rows = cursor.fetchall()
    print(f"invoice_matches: Will delete {len(invoice_rows)} rows matching seeded/fake invoice criteria.")
    for r in invoice_rows:
        print(f"  - Invoice ID: {r['invoice_id']}, Demand ID: {r['demand_id']}, Amount: ${r['invoice_amount']}")

    # Preview capex_opex_items to delete
    cursor.execute(
        "SELECT id, demand_id, description, amount FROM capex_opex_items WHERE ai_rationale IS NULL OR ai_rationale = ''"
    )
    capex_rows = cursor.fetchall()
    print(f"capex_opex_items: Will delete {len(capex_rows)} rows matching seeded/fake capex criteria.")
    for r in capex_rows:
        print(f"  - Description: '{r['description']}', Demand ID: {r['demand_id']}, Amount: ${r['amount']}")

    # --- EXECUTION PHASE ---
    print("\n--- EXECUTING CLEANUP ---")

    # 1. Delete budget_records
    cursor.execute("DELETE FROM budget_records")
    deleted_budget_count = cursor.rowcount

    # 2. Update vendor_records
    updated_alerts_count = 0
    removed_users_count = 0
    for r in vendor_rows:
        rec_id = r["id"]
        alerts_str = r["access_alerts"]
        if alerts_str:
            try:
                alerts = json.loads(alerts_str)
                if isinstance(alerts, list):
                    original_len = len(alerts)
                    filtered_alerts = [a for a in alerts if a.get("user") != "vendor_contractor_1"]
                    if len(filtered_alerts) < original_len:
                        cursor.execute(
                            "UPDATE vendor_records SET access_alerts = ? WHERE id = ?",
                            (json.dumps(filtered_alerts), rec_id)
                        )
                        updated_alerts_count += 1
                        removed_users_count += (original_len - len(filtered_alerts))
            except Exception as e:
                print(f"Error parsing access_alerts for record {rec_id}: {e}")

    # 3. Delete invoice_matches
    cursor.execute(
        "DELETE FROM invoice_matches WHERE (ai_analysis IS NULL OR ai_analysis = '') AND (decision IS NULL OR decision = '')"
    )
    deleted_invoices_count = cursor.rowcount

    # 4. Delete capex_opex_items
    cursor.execute(
        "DELETE FROM capex_opex_items WHERE ai_rationale IS NULL OR ai_rationale = ''"
    )
    deleted_capex_count = cursor.rowcount

    conn.commit()
    conn.close()

    print("\n--- RESULTS ---")
    print(f"- Deleted {deleted_budget_count} rows from budget_records")
    print(f"- Updated {updated_alerts_count} vendor_records rows (removed {removed_users_count} instances of vendor_contractor_1)")
    print(f"- Deleted {deleted_invoices_count} rows from invoice_matches")
    print(f"- Deleted {deleted_capex_count} rows from capex_opex_items")

if __name__ == "__main__":
    cleanup()
