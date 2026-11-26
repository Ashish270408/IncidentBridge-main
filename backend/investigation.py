from db import get_db_connection

class InvestigationError(Exception):
    pass

def validate_investigation_access(cursor, incident_id, actor_id):

    # Verify that the user is active and has an authorized role.
    cursor.execute("""
        SELECT user_id, role_id
        FROM users
        WHERE user_id = %s
        AND is_active = TRUE
        AND role_id IN (2, 3)
    """, (actor_id,))

    actor = cursor.fetchone()

    if not actor:
        raise InvestigationError(
            "You are not authorized to access investigation notes."
        )

    # Retrieve the incident and its assigned analyst.
    cursor.execute("""
        SELECT incident_id, assigned_to
        FROM incidents
        WHERE incident_id = %s
    """, (incident_id,))

    incident = cursor.fetchone()

    if not incident:
        raise InvestigationError("Incident not found.")

    # Administrators can access all incidents.
    # Analysts can access only incidents assigned to them.
    if (
        actor["role_id"] == 2
        and incident["assigned_to"] != actor_id
    ):
        raise InvestigationError(
            "You can only access notes for incidents assigned to you."
        )


def add_investigation_note(incident_id, author_id, note_content):

    if not isinstance(note_content, str) or not note_content.strip():
        raise InvestigationError("Note content cannot be empty.")

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        connection.start_transaction()

        validate_investigation_access(
            cursor, incident_id, author_id
        )

        cursor.execute("""
            INSERT INTO investigation_notes (
                incident_id,
                author_id,
                note_content
            )
            VALUES (%s, %s, %s)
        """, (incident_id, author_id, note_content.strip()))

        note_id = cursor.lastrowid

        connection.commit()

        return {
            "success": True,
            "note_id": note_id,
            "message": "Investigation note added successfully."
        }

    except Exception:
        connection.rollback()
        raise

    finally:
        cursor.close()
        connection.close()


def get_investigation_notes(incident_id, actor_id):

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        validate_investigation_access(
            cursor, incident_id, actor_id
        )

        cursor.execute("""
            SELECT
                n.note_id,
                n.incident_id,
                n.note_content,
                n.created_at,
                u.full_name AS author_name
            FROM investigation_notes n
            JOIN users u ON n.author_id = u.user_id
            WHERE n.incident_id = %s
            ORDER BY n.created_at ASC, n.note_id ASC
        """, (incident_id,))

        return cursor.fetchall()

    finally:
        cursor.close()
        connection.close()