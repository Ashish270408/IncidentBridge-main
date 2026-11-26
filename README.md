# IncidentBridge

**A Role-Based Cybersecurity Incident Management System**

IncidentBridge is a web-based incident management platform designed to help organizations report, track, assign, and manage cybersecurity incidents through a centralized system.

It provides a structured workflow for handling security incidents, allowing reporters to submit incidents, security analysts to investigate them, and administrators to oversee assignments and incident management.

The project focuses on making incident handling more organized, traceable, and accountable.

---

## Problem Statement

Organizations need a structured way to handle cybersecurity incidents. Without a centralized incident management process, reports can become difficult to track, responsibilities may be unclear, and investigation activities can lack proper documentation.

IncidentBridge addresses this by providing a centralized platform where incidents can be reported, assigned, investigated, and tracked throughout their lifecycle.

## Key Features

- **Role-Based Access Control:** Separate access and permissions for Reporters, Security Analysts, and Administrators.
- **Incident Reporting:** Submit cybersecurity incidents with descriptions, categories, and severity levels.
- **Incident Assignment:** Administrators can assign incidents to security analysts.
- **Workload-Based Recommendations:** Recommends analysts based on their number of active incidents, while keeping final assignment under human control.
- **Incident Lifecycle Management:** Track incidents through defined statuses:
  - Reported
  - Triaged
  - Investigating
  - Contained
  - Resolved
  - Closed
- **Investigation Notes:** Authorized analysts can document investigation activities.
- **Dashboard:** View incident statistics and an overview of incident activity.
- **Reports and Analytics:** Analyze incidents by severity, category, status, creation date, and analyst workload.
- **Assignment and Status History:** Maintain records of important incident management activities.

## User Roles

| Role | Responsibilities |
|---|---|
| Reporter | Submit incidents and track reported incidents. |
| Security Analyst | Access assigned incidents, investigate them, add investigation notes, and update statuses. |
| Administrator | Oversee incident management, manage assignments, and access reports and analyst information. |

## Technology Stack

| Component | Technology |
|---|---|
| Backend | Python, Flask |
| Database | MySQL |
| Frontend | HTML, CSS, JavaScript |
| Authentication | Flask Sessions, bcrypt |
| Database Connectivity | MySQL Connector/Python |
| Environment Configuration | python-dotenv |

## System Architecture

IncidentBridge follows a client-server architecture.

1. The frontend provides the interface through which users interact with the application.
2. JavaScript communicates with the backend through REST API endpoints.
3. Flask processes requests, applies authentication and authorization checks, and executes application logic.
4. MySQL stores user information, incidents, assignments, statuses, and investigation records.
5. The backend returns JSON responses that the frontend uses to update the interface.

```text
             User
              |
              v
       Frontend Interface
        HTML / CSS / JS
              |
              v
          Flask API
              |
       Authentication &
       Authorization
              |
              v
       Application Logic
              |
              v
          MySQL DB
              |
              v
        JSON Response
              |
              v
       Frontend Update
```

## Incident Management Workflow

```text
Incident Reported
        |
        v
     Triaged
        |
        v
   Investigating
        |
        v
     Contained
        |
        v
     Resolved
        |
        v
      Closed
```

The system uses controlled status transitions to maintain a structured incident lifecycle.

## Security and Design Considerations

The application incorporates several security-focused implementation practices:

- Password hashing using bcrypt instead of storing plaintext passwords.
- Role-based authorization to restrict access to protected endpoints.
- Parameterized SQL queries to reduce SQL injection risks.
- Session-based authentication.
- Server-side input validation.
- Transaction handling for critical database operations.
- Assignment and status history to support accountability.
- Access restrictions for investigation notes.

## Getting Started

### Prerequisites

Make sure you have the following installed:

- Python 3.10 or later
- MySQL Server
- Git

### 1. Clone the repository

```bash
git clone https://github.com/Ashish270408/IncidentBridge.git
cd IncidentBridge
```

### 2. Create a virtual environment

```bash
python -m venv venv
```

Activate it:

**Windows:**
```powershell
venv\Scripts\activate
```

**Linux/macOS:**
```bash
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install Flask mysql-connector-python python-dotenv bcrypt
```

### 4. Configure environment variables

Create a `.env` file in the backend directory.

Add your database credentials and Flask secret key:

```env
DB_HOST=localhost
DB_USER=your_mysql_username
DB_PASSWORD=your_mysql_password
DB_NAME=incidentbridge

FLASK_SECRET_KEY=your_secure_random_secret_key
```

Replace the example values with your own configuration.

**Important:** Never commit your `.env` file or expose database credentials and secret keys on GitHub.

### 5. Set up the database

Create a MySQL database named `incidentbridge` and configure the required tables and relationships using your project's database schema.

Make sure the database credentials in `.env` match your MySQL configuration.

### 6. Run the application

Navigate to the backend directory and execute:

```bash
python app.py
```

Open the application in your browser using the local address displayed by Flask, typically:

```text
http://127.0.0.1:5000
```

## Project Structure

The project is organized into separate backend and frontend components.

```text
IncidentBridge/
│
├── backend/
│   ├── app.py
│   ├── db.py
│   ├── auth.py
│   ├── assignments.py
│   ├── status_updates.py
│   ├── investigation.py
│   └── .env
│
├── frontend/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── .gitignore
└── README.md
```

*Adjust the structure above if your actual repository uses different filenames or folders.*

## Future Improvements

Potential areas for further development include:

- Email notifications for incident assignments and status changes.
- File and evidence attachment support.
- More advanced incident analytics.
- Integration with security monitoring tools and SIEM platforms.
- Automated incident prioritization.
- Deployment with production-grade security configuration.

## Project Purpose

IncidentBridge was developed as a cybersecurity-focused software project to explore the practical implementation of database management, backend development, authentication, authorization, and incident response workflows.

It demonstrates how software engineering concepts can be applied to a real-world cybersecurity problem.

---

**Note:** IncidentBridge is an academic and learning project. It is not intended to replace a production-grade Security Information and Event Management (SIEM) or Security Incident Response Platform.

## Author

**Ashish**

Cybersecurity Student

GitHub: [Add your GitHub profile link](https://github.com/)
