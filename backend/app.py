import os
import uuid

from flask import (Flask, jsonify, request, send_from_directory, session, g)
from datetime import datetime, timedelta
from dotenv import load_dotenv
from db import get_db_connection
from assignments import confirm_assignment, AssignmentError
from status_updates import (
    update_incident_status,
    StatusUpdateError,
    StatusAuthorizationError
)
from investigation import (
    add_investigation_note,
    get_investigation_notes,
    InvestigationError
)
from auth import (authenticate_user, AuthenticationError, login_required, roles_required)


# --------------------------------------------------
# APPLICATION CONFIGURATION
# --------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(
    os.path.join(BASE_DIR, "..", "frontend")
)

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")

# --------------------------------------------------
# SESSION CONFIGURATION
# --------------------------------------------------

load_dotenv()

app.secret_key = os.getenv("FLASK_SECRET_KEY")

if not app.secret_key:
    raise RuntimeError("FLASK_SECRET_KEY is missing from .env")

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=False,  # True when deployed with HTTPS
    PERMANENT_SESSION_LIFETIME=timedelta(hours=2)
)

# Temporary development identities.
# Replace these with authenticated sessions before production.


@app.route("/")
def home():
    return send_from_directory(FRONTEND_DIR, "index.html")

# --------------------------------------------------
# AUTHENTICATION ENDPOINTS
# --------------------------------------------------

@app.route("/api/auth/login", methods=["POST"])
def login():

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "success": False,
            "message": "Valid JSON data is required."
        }), 400

    email = data.get("email")
    password = data.get("password")

    try:
        user = authenticate_user(email, password)

        # Clear any previous session before creating a new one.
        session.clear()

        session.permanent = True
        session["user_id"] = user["user_id"]
        session["role_id"] = user["role_id"]

        return jsonify({
            "success": True,
            "message": "Login successful.",
            "user": {
                "user_id": user["user_id"],
                "full_name": user["full_name"],
                "email": user["email"],
                "role_id": user["role_id"]
            }
        }), 200

    except AuthenticationError as error:
        return jsonify({
            "success": False,
            "message": str(error)
        }), 401

    except Exception:
        app.logger.exception("Login failed")

        return jsonify({
            "success": False,
            "message": "An unexpected error occurred."
        }), 500


@app.route("/api/auth/logout", methods=["POST"])
def logout():

    session.clear()

    return jsonify({
        "success": True,
        "message": "Logged out successfully."
    }), 200


@app.route("/api/auth/me", methods=["GET"])
def current_user():

    user_id = session.get("user_id")

    if not user_id:
        return jsonify({
            "success": False,
            "authenticated": False,
            "message": "Authentication required."
        }), 401

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT user_id, full_name, email, role_id
            FROM users
            WHERE user_id = %s
            AND is_active = TRUE
        """, (user_id,))

        user = cursor.fetchone()

        if not user:
            session.clear()

            return jsonify({
                "success": False,
                "authenticated": False,
                "message": "Account unavailable."
            }), 401

        return jsonify({
            "success": True,
            "authenticated": True,
            "user": user
        }), 200

    finally:
        cursor.close()
        connection.close()

# --------------------------------------------------
# ANALYST ENDPOINTS
# --------------------------------------------------

@app.route("/api/analysts", methods=["GET"])
@login_required
@roles_required(2, 3)
def get_analysts():

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT user_id, full_name
            FROM users
            WHERE role_id = 2
            AND is_active = TRUE
            ORDER BY full_name
        """)

        return jsonify({
            "success": True,
            "analysts": cursor.fetchall()
        })

    finally:
        cursor.close()
        connection.close()

@app.route("/api/analysts/recommend", methods=["GET"])
@login_required
@roles_required(2, 3)
def recommend_analyst():

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                u.user_id,
                u.full_name,
                COUNT(i.incident_id) AS open_incidents
            FROM users u
            LEFT JOIN incidents i
                ON u.user_id = i.assigned_to
                AND i.status_id NOT IN (5, 6)
            WHERE u.role_id = 2
            AND u.is_active = TRUE
            GROUP BY u.user_id, u.full_name
            ORDER BY open_incidents ASC, u.user_id ASC
        """)

        analysts = cursor.fetchall()

        if not analysts:
            return jsonify({
                "success": False,
                "message": "No active Security Analysts available."
            }), 404

        return jsonify({
            "success": True,
            "recommended_analyst": analysts[0],
            "all_analysts": analysts
        })

    finally:
        cursor.close()
        connection.close()


@app.route("/api/analysts/directory", methods=["GET"])
@login_required
@roles_required(2, 3)
def get_analyst_directory():

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                u.user_id,
                u.full_name,
                u.email,
                u.is_active,

                COUNT(
                    CASE
                        WHEN i.incident_id IS NOT NULL
                        AND i.status_id NOT IN (5, 6)
                        THEN 1
                    END
                ) AS open_incidents,

                COUNT(
                    CASE WHEN i.status_id = 5 THEN 1 END
                ) AS resolved_incidents,

                COUNT(
                    CASE WHEN i.status_id = 6 THEN 1 END
                ) AS closed_incidents,

                COUNT(i.incident_id) AS total_assigned

            FROM users u

            LEFT JOIN incidents i
                ON u.user_id = i.assigned_to

            WHERE u.role_id = 2
            AND (
                %s = 3
                OR u.is_active = TRUE
            )

            GROUP BY
                u.user_id,
                u.full_name,
                u.email,
                u.is_active

            ORDER BY
                u.is_active DESC,
                open_incidents ASC,
                u.full_name ASC
        """, (g.current_user["role_id"],))

        return jsonify({
            "success": True,
            "analysts": cursor.fetchall()
        }), 200

    finally:
        cursor.close()
        connection.close()


# --------------------------------------------------
# DASHBOARD ENDPOINT
# --------------------------------------------------

@app.route("/api/dashboard/summary", methods=["GET"])
@login_required
@roles_required(1, 2, 3)
def dashboard_summary():

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                COUNT(*) AS total_incidents,
                SUM(
                    CASE WHEN status_id NOT IN (5, 6)
                    THEN 1 ELSE 0 END
                ) AS active_incidents,
                SUM(
                    CASE WHEN severity_id = 4
                    AND status_id NOT IN (5, 6)
                    THEN 1 ELSE 0 END
                ) AS critical_incidents,
                SUM(
                    CASE WHEN status_id IN (5, 6)
                    THEN 1 ELSE 0 END
                ) AS resolved_incidents
            FROM incidents
        """)

        return jsonify({
            "success": True,
            "summary": cursor.fetchone()
        })

    finally:
        cursor.close()
        connection.close()


# --------------------------------------------------
# REPORTS ENDPOINT
# --------------------------------------------------

@app.route("/api/reports/summary", methods=["GET"])
@login_required
@roles_required(2, 3)
def get_reports_summary():

    # Optional date filters: YYYY-MM-DD
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")

    try:
        start_date = (
            datetime.strptime(date_from, "%Y-%m-%d")
            if date_from else None
        )

        end_date = (
            datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)
            if date_to else None
        )

        if start_date and end_date and start_date >= end_date:
            raise ValueError

    except ValueError:
        return jsonify({
            "success": False,
            "message": "Invalid date range. Use YYYY-MM-DD and ensure the start date is not after the end date."
        }), 400

    date_condition = ""
    date_params = []

    if start_date:
        date_condition += " AND i.created_at >= %s"
        date_params.append(start_date)

    if end_date:
        date_condition += " AND i.created_at < %s"
        date_params.append(end_date)

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        # 1. Overall summary
        cursor.execute(f"""
            SELECT
                COUNT(*) AS total_incidents,

                COUNT(CASE
                    WHEN i.status_id NOT IN (5, 6)
                    THEN 1
                END) AS open_incidents,

                COUNT(CASE
                    WHEN i.status_id IN (5, 6)
                    THEN 1
                END) AS completed_incidents

            FROM incidents i
            WHERE 1 = 1 {date_condition}
        """, tuple(date_params))

        summary = cursor.fetchone()

        total = summary["total_incidents"] or 0
        completed = summary["completed_incidents"] or 0

        summary["resolution_rate"] = (
            round((completed / total) * 100, 1)
            if total else 0
        )

        # 2. Incidents by severity
        cursor.execute(f"""
            SELECT
                s.severity_name,
                COUNT(i.incident_id) AS incident_count
            FROM severity_levels s
            LEFT JOIN incidents i
                ON s.severity_id = i.severity_id
                {date_condition}
            GROUP BY s.severity_id, s.severity_name
            ORDER BY s.severity_id
        """, tuple(date_params))

        by_severity = cursor.fetchall()

        # 3. Incidents by category
        cursor.execute(f"""
            SELECT
                c.category_name,
                COUNT(i.incident_id) AS incident_count
            FROM incident_categories c
            LEFT JOIN incidents i
                ON c.category_id = i.category_id
                {date_condition}
            GROUP BY c.category_id, c.category_name
            ORDER BY incident_count DESC
        """, tuple(date_params))

        by_category = cursor.fetchall()

        # 4. Incidents by status
        cursor.execute(f"""
            SELECT
                st.status_name,
                COUNT(i.incident_id) AS incident_count
            FROM incident_statuses st
            LEFT JOIN incidents i
                ON st.status_id = i.status_id
                {date_condition}
            GROUP BY st.status_id, st.status_name
            ORDER BY st.status_id
        """, tuple(date_params))

        by_status = cursor.fetchall()

        # 5. Incident creation trend
        cursor.execute(f"""
            SELECT
                DATE(i.created_at) AS incident_date,
                COUNT(*) AS incident_count
            FROM incidents i
            WHERE 1 = 1 {date_condition}
            GROUP BY DATE(i.created_at)
            ORDER BY incident_date
        """, tuple(date_params))

        incident_trend = cursor.fetchall()

        # 6. Analyst workload and completed incidents
        cursor.execute(f"""
            SELECT
                u.user_id,
                u.full_name,
                COUNT(CASE
                    WHEN i.status_id NOT IN (5, 6)
                    THEN i.incident_id
                END) AS open_incidents,

                COUNT(CASE
                    WHEN i.status_id = 5
                    THEN i.incident_id
                END) AS resolved_incidents,

                COUNT(CASE
                    WHEN i.status_id = 6
                    THEN i.incident_id
                END) AS closed_incidents

            FROM users u
            LEFT JOIN incidents i
                ON u.user_id = i.assigned_to
                {date_condition}

            WHERE u.role_id = 2

            GROUP BY u.user_id, u.full_name
            ORDER BY open_incidents ASC, u.full_name ASC
        """, tuple(date_params))

        analyst_workload = cursor.fetchall()

        return jsonify({
            "success": True,
            "summary": summary,
            "by_severity": by_severity,
            "by_category": by_category,
            "by_status": by_status,
            "incident_trend": incident_trend,
            "analyst_workload": analyst_workload
        }), 200

    finally:
        cursor.close()
        connection.close()

# --------------------------------------------------
# INCIDENT ENDPOINTS
# --------------------------------------------------

@app.route("/api/incidents", methods=["GET"])
@login_required
@roles_required(1, 2, 3)
def get_incidents():

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                i.incident_id,
                i.incident_code,
                i.title,
                reporter.full_name AS reported_by,
                i.assigned_to,
                analyst.full_name AS assigned_analyst,
                c.category_name,
                s.severity_name,
                st.status_name,
                i.created_at
            FROM incidents i
            INNER JOIN users reporter
                ON i.reporter_id = reporter.user_id
            LEFT JOIN users analyst
                ON i.assigned_to = analyst.user_id
            INNER JOIN incident_categories c
                ON i.category_id = c.category_id
            INNER JOIN severity_levels s
                ON i.severity_id = s.severity_id
            INNER JOIN incident_statuses st
                ON i.status_id = st.status_id
            WHERE (
                %s IN (2, 3)
                OR i.reporter_id = %s
            )
            ORDER BY i.created_at DESC
        """, (g.current_user["role_id"], g.current_user["user_id"]))

        return jsonify({
            "success": True,
            "incidents": cursor.fetchall()
        })

    finally:
        cursor.close()
        connection.close()


# --------------------------------------------------
# INVESTIGATIONS ENDPOINT
# --------------------------------------------------

@app.route("/api/investigations", methods=["GET"])
@login_required
@roles_required(2, 3)
def get_investigations():

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                i.incident_id,
                i.incident_code,
                i.title,
                i.assigned_to,
                analyst.full_name AS assigned_analyst,
                c.category_name,
                s.severity_name,
                st.status_name,
                i.created_at,
                i.updated_at
            FROM incidents i
            LEFT JOIN users analyst
                ON i.assigned_to = analyst.user_id
            INNER JOIN incident_categories c
                ON i.category_id = c.category_id
            INNER JOIN severity_levels s
                ON i.severity_id = s.severity_id
            INNER JOIN incident_statuses st
                ON i.status_id = st.status_id
            WHERE st.status_name IN ('Investigating', 'Contained')
            AND (
                %s = 3
                OR i.assigned_to = %s
            )
            ORDER BY i.updated_at DESC
        """, (
            g.current_user["role_id"],
            g.current_user["user_id"]
        ))

        return jsonify({
            "success": True,
            "investigations": cursor.fetchall()
        }), 200

    finally:
        cursor.close()
        connection.close()


@app.route("/api/incidents/<int:incident_id>", methods=["GET"])
@login_required
@roles_required(1, 2, 3)
def get_incident_details(incident_id):

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                i.incident_id,
                i.incident_code,
                i.title,
                i.description,
                reporter.full_name AS reported_by,
                i.assigned_to,
                analyst.full_name AS assigned_analyst,
                c.category_name,
                s.severity_name,
                st.status_name,
                i.created_at,
                i.updated_at,
                i.resolved_at
            FROM incidents i
            INNER JOIN users reporter
                ON i.reporter_id = reporter.user_id
            LEFT JOIN users analyst
                ON i.assigned_to = analyst.user_id
            INNER JOIN incident_categories c
                ON i.category_id = c.category_id
            INNER JOIN severity_levels s
                ON i.severity_id = s.severity_id
            INNER JOIN incident_statuses st
                ON i.status_id = st.status_id
            WHERE i.incident_id = %s
            AND (
                %s IN (2, 3)
                OR i.reporter_id = %s
            )
        """, (
            incident_id,
            g.current_user["role_id"],
            g.current_user["user_id"]
        ))

        incident = cursor.fetchone()

        if not incident:
            return jsonify({
                "success": False,
                "message": "Incident not found."
            }), 404

        return jsonify({
            "success": True,
            "incident": incident
        })

    finally:
        cursor.close()
        connection.close()


@app.route("/api/incident-options", methods=["GET"])
@login_required
@roles_required(1, 2, 3)
def get_incident_options():

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT category_id, category_name
            FROM incident_categories
            ORDER BY category_name
        """)
        categories = cursor.fetchall()

        cursor.execute("""
            SELECT severity_id, severity_name
            FROM severity_levels
            ORDER BY severity_id
        """)
        severities = cursor.fetchall()

        return jsonify({
            "success": True,
            "categories": categories,
            "severities": severities
        })

    finally:
        cursor.close()
        connection.close()


@app.route("/api/incidents/report", methods=["POST"])
@login_required
@roles_required(1, 3)
def report_incident():

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "success": False,
            "message": "A valid JSON request body is required."
        }), 400

    title = data.get("title")
    description = data.get("description")

    if not isinstance(title, str) or not title.strip():
        return jsonify({
            "success": False,
            "message": "Incident title is required."
        }), 400

    if len(title.strip()) > 150:
        return jsonify({
            "success": False,
            "message": "Incident title must be 150 characters or fewer."
        }), 400

    if not isinstance(description, str) or not description.strip():
        return jsonify({
            "success": False,
            "message": "Incident description is required."
        }), 400

    try:
        category_id = int(data.get("category_id"))
        severity_id = int(data.get("severity_id"))

        if category_id < 1 or severity_id < 1:
            raise ValueError

    except (ValueError, TypeError):
        return jsonify({
            "success": False,
            "message": "Select a valid category and severity."
        }), 400

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        connection.start_transaction()
        
        # Validate that the selected category exists.
        cursor.execute("""
            SELECT category_id
            FROM incident_categories
            WHERE category_id = %s
        """, (category_id,))

        if cursor.fetchone() is None:
            return jsonify({
                "success": False,
                "message": "The selected incident category is invalid."
            }), 400

        # Validate that the selected severity exists.
        cursor.execute("""
            SELECT severity_id
            FROM severity_levels
            WHERE severity_id = %s
        """, (severity_id,))

        if cursor.fetchone() is None:
            return jsonify({
                "success": False,
                "message": "The selected incident severity is invalid."
            }), 400

        reporter_id = g.current_user["user_id"]

        # A temporary unique code allows us to insert the row first.
        # The final code is generated from its auto-increment ID.
        temporary_code = f"TMP-{uuid.uuid4().hex[:12]}"

        cursor.execute("""
            INSERT INTO incidents (
                incident_code,
                title,
                description,
                reporter_id,
                assigned_to,
                category_id,
                severity_id,
                status_id
            )
            VALUES (%s, %s, %s, %s, NULL, %s, %s, 1)
        """, (
            temporary_code,
            title.strip(),
            description.strip(),
            reporter_id,
            category_id,
            severity_id
        ))

        incident_id = cursor.lastrowid
        incident_code = f"INC-{incident_id:04d}"

        cursor.execute("""
            UPDATE incidents
            SET incident_code = %s
            WHERE incident_id = %s
        """, (incident_code, incident_id))

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
            reporter_id,
            "CREATED",
            None,
            "Reported",
            "Incident reported successfully."
        ))

        connection.commit()

        return jsonify({
            "success": True,
            "message": "Incident reported successfully.",
            "incident_id": incident_id,
            "incident_code": incident_code
        }), 201

    except Exception:
        connection.rollback()
        app.logger.exception("Incident reporting failed")

        return jsonify({
            "success": False,
            "message": "Unable to report incident. Please try again."
        }), 500

    finally:
        cursor.close()
        connection.close()


# --------------------------------------------------
# ACTIVITY ENDPOINT
# --------------------------------------------------

@app.route("/api/activity", methods=["GET"])
@login_required
@roles_required(2, 3)
def get_recent_activity():

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                h.history_id,
                h.incident_id,
                i.incident_code,
                h.activity_type,
                h.activity_description,
                h.created_at,
                u.full_name AS performed_by
            FROM incident_history h
            LEFT JOIN incidents i
                ON h.incident_id = i.incident_id
            LEFT JOIN users u
                ON h.user_id = u.user_id
            ORDER BY h.created_at DESC
            LIMIT 8
        """)

        return jsonify({
            "success": True,
            "activities": cursor.fetchall()
        })

    finally:
        cursor.close()
        connection.close()


# --------------------------------------------------
# INCIDENT ASSIGNMENT ENDPOINT
# --------------------------------------------------

@app.route("/api/incidents/assign", methods=["POST"])
@login_required
@roles_required(3)
def assign_incident():

    data = request.get_json(silent=True) or {}

    incident_id = data.get("incident_id")
    analyst_id = data.get("analyst_id")

    if incident_id is None or analyst_id is None:
        return jsonify({
            "success": False,
            "message": "incident_id and analyst_id are required."
        }), 400

    try:
        result = confirm_assignment(
            incident_id=int(incident_id),
            analyst_id=int(analyst_id),
            actor_id=g.current_user["user_id"]
        )

        return jsonify(result), 200

    except (ValueError, TypeError):
        return jsonify({
            "success": False,
            "message": "Incident ID and analyst ID must be integers."
        }), 400

    except AssignmentError as error:
        return jsonify({
            "success": False,
            "message": str(error)
        }), 400

    except Exception:
        app.logger.exception("Assignment failed")

        return jsonify({
            "success": False,
            "message": "An internal error occurred."
        }), 500

@app.route("/api/incidents/update-status", methods=["POST"])
@login_required
@roles_required(2, 3)
def update_status():

    data = request.get_json(silent=True)

    if not data:
        return jsonify({
            "success": False,
            "message": "Invalid or missing JSON data."
        }), 400

    incident_id = data.get("incident_id")
    status_id = data.get("status_id")

    if (
        not isinstance(incident_id, int)
        or isinstance(incident_id, bool)
        or not isinstance(status_id, int)
        or isinstance(status_id, bool)
    ):
        return jsonify({
            "success": False,
            "message": "Valid incident_id and status_id are required."
        }), 400

    try:
        result = update_incident_status(
            incident_id=incident_id,
            new_status_id=status_id,
            actor_id=g.current_user["user_id"]
        )

        return jsonify(result), 200

    except StatusAuthorizationError as error:
        return jsonify({
            "success": False,
            "message": str(error)
        }), 403

    except StatusUpdateError as error:
        return jsonify({
            "success": False,
            "message": str(error)
        }), 400

    except Exception as error:
        print("Status update error:", error)

        return jsonify({
            "success": False,
            "message": "An unexpected error occurred."
        }), 500

@app.route("/api/incidents/<int:incident_id>/notes", methods=["GET"])
@login_required
@roles_required(2, 3)
def get_incident_notes(incident_id):

    try:
        notes = get_investigation_notes(incident_id, g.current_user["user_id"])

        return jsonify({
            "success": True,
            "notes": notes
        }), 200
        
    except InvestigationError as error:
        return jsonify({
            "success": False,
            "message": str(error)
        }), 403

    except Exception as error:
        print("Retrieve notes error:", error)

        return jsonify({
            "success": False,
            "message": "Unable to retrieve investigation notes."
        }), 500

@app.route("/api/incidents/<int:incident_id>/notes", methods=["POST"])
@login_required
@roles_required(2, 3)
def create_incident_note(incident_id):

    data = request.get_json(silent=True)

    if not data:
        return jsonify({
            "success": False,
            "message": "Invalid or missing JSON data."
        }), 400

    note_content = data.get("note_content")

    if not isinstance(note_content, str) or not note_content.strip():
        return jsonify({
            "success": False,
            "message": "Note content cannot be empty."
        }), 400

    try:
        result = add_investigation_note(
            incident_id=incident_id,
            author_id=g.current_user["user_id"],
            note_content=note_content
        )

        return jsonify(result), 201

    except InvestigationError as error:
        return jsonify({
            "success": False,
            "message": str(error)
        }), 403

    except Exception as error:
        print("Create note error:", error)

        return jsonify({
            "success": False,
            "message": "An unexpected error occurred."
        }), 500

if __name__ == "__main__":
    app.run(debug=True)
