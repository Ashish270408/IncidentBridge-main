from db import get_db_connection

class AssignmentError(Exception):
    pass

def confirm_assignment(incident_id, analyst_id, actor_id):

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        connection.start_transaction()

        # 1. Verify the person confirming the assignment
        cursor.execute("""
            SELECT user_id, role_id, is_active
            FROM users
            WHERE user_id = %s
            FOR UPDATE
        """, (actor_id,))

        actor = cursor.fetchone()

        if not actor or not actor["is_active"]:
            raise AssignmentError("Invalid or inactive user.")

        if actor["role_id"] != 3:
            raise AssignmentError(
                "Only Administrators can assign or reassign incidents."
            )

        # 2. Verify that the selected analyst is eligible
        cursor.execute("""
            SELECT user_id, full_name
            FROM users
            WHERE user_id = %s
            AND role_id = 2
            AND is_active = TRUE
            FOR UPDATE
        """, (analyst_id,))

        analyst = cursor.fetchone()

        if not analyst:
            raise AssignmentError(
                "Selected analyst does not exist or is inactive."
            )

        # 3. Retrieve and lock the incident
        cursor.execute("""
            SELECT incident_id, assigned_to, status_id
            FROM incidents
            WHERE incident_id = %s
            FOR UPDATE
        """, (incident_id,))

        incident = cursor.fetchone()

        if not incident:
            raise AssignmentError("Incident not found.")

        old_analyst = incident["assigned_to"]
        old_analyst_name = None

        if old_analyst is not None:
            cursor.execute("""
                SELECT full_name
                FROM users
                WHERE user_id = %s
            """, (old_analyst,))

            previous_analyst = cursor.fetchone()

            if previous_analyst:
                old_analyst_name = previous_analyst["full_name"]
        if old_analyst == analyst_id:
            connection.commit()

            return {
                "success": True,
                "message": "Incident is already assigned to this analyst.",
                "incident_id": incident_id,
                "assigned_to": analyst_id,
                "changed": False,
                "status_changed": False
            }

        # 4. Update the assignment
        cursor.execute("""
            UPDATE incidents
            SET assigned_to = %s
            WHERE incident_id = %s
        """, (analyst_id, incident_id))

        # 5. Record the assignment in the audit history
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
            "ASSIGNMENT",
            str(old_analyst) if old_analyst is not None else None,
            str(analyst_id),
            (
                f"Incident reassigned from {old_analyst_name} "
                f"to {analyst['full_name']}."
                if old_analyst is not None
                else f"Incident assigned to {analyst['full_name']}."
            )
        ))

        # 6. Automatically move Reported incidents to Triaged
        status_changed = False

        if incident["status_id"] == 1:
            cursor.execute("""
                UPDATE incidents
                SET status_id = 2
                WHERE incident_id = %s
            """, (incident_id,))

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
                "Reported",
                "Triaged",
                "Incident status automatically changed from Reported to Triaged after analyst assignment."
            ))

            status_changed = True

        # 7. Commit assignment and status changes together
        connection.commit()

        return {
            "success": True,
            "incident_id": incident_id,
            "assigned_to": analyst_id,
            "previous_assignee": old_analyst,
            "status_changed": status_changed,
            "new_status": "Triaged" if status_changed else None
        }

    except Exception:
        connection.rollback()
        raise

    finally:
        cursor.close()
        connection.close()