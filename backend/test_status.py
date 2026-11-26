from app import app

client = app.test_client()

# Move INC-0004 from Reported to Triaged.
response = client.post(
    "/api/incidents/update-status",
    json={
        "incident_id": 4,
        "status_id": 2
    }
)

print("\n--- STATUS UPDATE RESPONSE ---")
print("HTTP Status:", response.status_code)
print(response.get_json())

# Retrieve the updated incident.
incident_response = client.get("/api/incidents/4")

print("\n--- UPDATED INCIDENT ---")
print(incident_response.get_json())

# Retrieve recent audit activity.
activity_response = client.get("/api/activity")

print("\n--- RECENT ACTIVITY ---")
print(activity_response.get_json())