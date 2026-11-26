import bcrypt
from functools import wraps

from flask import g, jsonify, session

from db import get_db_connection


class AuthenticationError(Exception):
    pass


def authenticate_user(email, password):

    if not isinstance(email, str) or not email.strip():
        raise AuthenticationError("Email is required.")

    if not isinstance(password, str) or not password:
        raise AuthenticationError("Password is required.")

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                user_id,
                full_name,
                email,
                password_hash,
                role_id,
                is_active
            FROM users
            WHERE email = %s
        """, (email.strip().lower(),))

        user = cursor.fetchone()

        if not user:
            raise AuthenticationError("Invalid email or password.")

        if not user["is_active"]:
            raise AuthenticationError("This account is inactive.")

        try:
            password_matches = bcrypt.checkpw(
                password.encode("utf-8"),
                user["password_hash"].encode("utf-8")
            )
        except (ValueError, TypeError):
            password_matches = False

        if not password_matches:
            raise AuthenticationError("Invalid email or password.")

        return {
            "user_id": user["user_id"],
            "full_name": user["full_name"],
            "email": user["email"],
            "role_id": user["role_id"]
        }

    finally:
        cursor.close()
        connection.close()

def login_required(route_function):

    @wraps(route_function)
    def wrapper(*args, **kwargs):

        user_id = session.get("user_id")

        if not user_id:
            return jsonify({
                "success": False,
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
                    "message": "Your account is unavailable. Please log in again."
                }), 401

            g.current_user = user

        finally:
            cursor.close()
            connection.close()

        return route_function(*args, **kwargs)

    return wrapper


def roles_required(*allowed_roles):

    def decorator(route_function):

        @wraps(route_function)
        def wrapper(*args, **kwargs):

            user = getattr(g, "current_user", None)

            if not user:
                return jsonify({
                    "success": False,
                    "message": "Authentication required."
                }), 401

            if user["role_id"] not in allowed_roles:
                return jsonify({
                    "success": False,
                    "message": "You do not have permission to perform this action."
                }), 403

            return route_function(*args, **kwargs)

        return wrapper

    return decorator