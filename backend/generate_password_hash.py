import bcrypt
from getpass import getpass

password = getpass("Enter account password: ")

if not password:
    print("Password cannot be empty.")
    raise SystemExit(1)

hashed = bcrypt.hashpw(
    password.encode("utf-8"),
    bcrypt.gensalt()
)

print("\nGenerated bcrypt hash:")
print(hashed.decode("utf-8"))