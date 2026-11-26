
from assignments import confirm_assignment

try:
    result = confirm_assignment(
        incident_id=1,
        analyst_id=4,
        actor_id=3
    )

    print("ASSIGNMENT RESULT:")
    print(result)

except Exception as error:
    print("ASSIGNMENT FAILED:", error)
