from db import get_db_connection

class StatusUpdateError(Exception):
    pass

class StatusAuthorizationError(StatusUpdateError):
    """Raised when a user is authenticated but lacks permission for this update."""
    pass

# Only these forward transitions are permitted.
ALLOWED_TRANSITIONS = {
    "Reported": "Triaged",
    "Triaged": "Investigating",
    "Investigating": "Contained",
    "Contained": "Resolved",
    "Resolved": "Closed"
}

def update_incident_status(incident_id, new_status_id, actor_id):

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        connection.start_transaction()

        # Verify the person performing the update.
        cursor.execute("""
            SELECT user_id, role_id
            FROM users
            WHERE user_id = %s
            AND is_active = TRUE
            AND role_id IN (2, 3)
        """, (actor_id,))

        actor = cursor.fetchone()

        if not actor:
            raise StatusAuthorizationError(
                "You are not authorized to update incident status."
            )

        # Lock the incident and retrieve its current assignee.
        cursor.execute("""
            SELECT incident_id, status_id, assigned_to
            FROM incidents
            WHERE incident_id = %s
            FOR UPDATE
        """, (incident_id,))

        incident = cursor.fetchone()

        if not incident:
            raise StatusUpdateError("Incident not found.")

        # Analysts may update only incidents assigned to themselves.
        # Administrators retain authority over every incident.
        if (
            actor["role_id"] == 2
            and incident["assigned_to"] != actor_id
        ):
            raise StatusAuthorizationError(
                "You can update the status only of incidents assigned to you."
            )

        # Get current status.
        cursor.execute("""
            SELECT status_name
            FROM incident_statuses
            WHERE status_id = %s
        """, (incident["status_id"],))

        current_status = cursor.fetchone()

        # Get requested status.
        cursor.execute("""
            SELECT status_name
            FROM incident_statuses
            WHERE status_id = %s
        """, (new_status_id,))

        requested_status = cursor.fetchone()

        if not requested_status:
            raise StatusUpdateError("Invalid status selected.")

        old_status_name = current_status["status_name"]
        new_status_name = requested_status["status_name"]

        # Validate the transition.
        expected_status = ALLOWED_TRANSITIONS.get(old_status_name)

        if expected_status != new_status_name:
            raise StatusUpdateError(
                f"Invalid transition: {old_status_name} "
                f"cannot move to {new_status_name}."
            )

        # Update incident status.
        if new_status_name == "Resolved":
            cursor.execute("""
                UPDATE incidents
                SET status_id = %s,
                    resolved_at = CURRENT_TIMESTAMP
                WHERE incident_id = %s
            """, (new_status_id, incident_id))

        else:
            cursor.execute("""
                UPDATE incidents
                SET status_id = %s
                WHERE incident_id = %s
            """, (new_status_id, incident_id))

        # Record the change in the audit history.
        cursor.execute("""
            INSERT INTO incident_history (
                incident_id,
                user_id,
                activity_type,
                old_value,
                new_value,
                activity_description
            )
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            incident_id,
            actor_id,
            "STATUS_CHANGE",
            old_status_name,
            new_status_name,
            f"Incident status changed from {old_status_name} "
            f"to {new_status_name}."
        ))

        connection.commit()

        return {
            "success": True,
            "incident_id": incident_id,
            "previous_status": old_status_name,
            "new_status": new_status_name,
            "message": "Incident status updated successfully."
        }

    except Exception:
        connection.rollback()
        raise

    finally:
        cursor.close()
        connection.close()