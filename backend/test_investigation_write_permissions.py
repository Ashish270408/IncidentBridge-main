from investigation import (
    add_investigation_note,
    InvestigationError
)

incident_id = 4

# Test 1: Administrator can add a note
print("\n--- ADMIN WRITE ACCESS ---")
try:
    result = add_investigation_note(
        incident_id, 3,
        "Permission test: administrator access."
    )
    print("SUCCESS: Administrator can add notes.")
except InvestigationError as error:
    print("FAILED:", error)


# Test 2: Assigned analyst can add a note
print("\n--- ASSIGNED ANALYST WRITE ACCESS ---")
try:
    result = add_investigation_note(
        incident_id, 4,
        "Permission test: assigned analyst access."
    )
    print("SUCCESS: Assigned analyst can add notes.")
except InvestigationError as error:
    print("FAILED:", error)


# Test 3: Unassigned analyst cannot add a note
print("\n--- UNASSIGNED ANALYST WRITE ACCESS ---")
try:
    result = add_investigation_note(
        incident_id, 2,
        "This note should not be saved."
    )
    print("FAILED: Unassigned analyst was allowed to add a note.")
except InvestigationError as error:
    print("SUCCESS: Access correctly denied.")
    print("Reason:", error)