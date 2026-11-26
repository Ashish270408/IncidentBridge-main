from investigation import (
    get_investigation_notes,
    InvestigationError
)

incident_id = 4

# Test 1: Administrator access
print("\n--- ADMIN ACCESS ---")

try:
    notes = get_investigation_notes(incident_id, 3)
    print("SUCCESS: Administrator can access notes.")
except InvestigationError as error:
    print("FAILED:", error)


# Test 2: Assigned analyst access
print("\n--- ASSIGNED ANALYST ACCESS ---")

try:
    notes = get_investigation_notes(incident_id, 4)
    print("SUCCESS: Assigned analyst can access notes.")
except InvestigationError as error:
    print("FAILED:", error)


# Test 3: Unassigned analyst access
print("\n--- UNASSIGNED ANALYST ACCESS ---")

try:
    notes = get_investigation_notes(incident_id, 2)
    print("FAILED: Unassigned analyst was allowed access.")
except InvestigationError as error:
    print("SUCCESS: Access correctly denied.")
    print("Reason:", error)