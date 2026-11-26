
from db import get_db_connection

try:
    connection = get_db_connection()

    if connection.is_connected():
        print("SUCCESS: Connected to MySQL!")

        cursor = connection.cursor()
        cursor.execute("SELECT DATABASE()")

        database = cursor.fetchone()
        print("Connected database:", database[0])

        cursor.close()
        connection.close()

except Exception as error:
    print("DATABASE CONNECTION FAILED:", error)
