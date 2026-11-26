from app import app

client = app.test_client()

incident_id = 4

# Add an investigation note.
response = client.post(
    f"/api/incidents/{incident_id}/notes",
    json={
        "note_content": (
            "Initial investigation identified multiple failed "
            "login attempts from an unfamiliar IP address. "
            "Further verification is required."
        )
    }
)

print("\n--- ADD INVESTIGATION NOTE ---")
print("HTTP Status:", response.status_code)
print(response.get_json())


# Retrieve investigation notes.
response = client.get(
    f"/api/incidents/{incident_id}/notes"
)

print("\n--- RETRIEVE INVESTIGATION NOTES ---")
print("HTTP Status:", response.status_code)
print(response.get_json())