const API_BASE = "";

async function fetchData(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`);

    if (!response.ok) {
        throw new Error(`Request failed: ${endpoint}`);
    }

    return response.json();
}

// Safely display database values inside HTML.
function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
    });
}

// 1. Dashboard metrics
async function loadSummary() {
    const data = await fetchData("/api/dashboard/summary");
    const summary = data.summary;

    document.getElementById("total-incidents").textContent =
        summary.total_incidents ?? 0;

    document.getElementById("open-incidents").textContent =
        summary.active_incidents ?? 0;

    document.getElementById("critical-incidents").textContent =
        summary.critical_incidents ?? 0;

    document.getElementById("resolved-incidents").textContent =
        summary.resolved_incidents ?? 0;
}

// 2. Incident queue
let allIncidents = [];
let activeIncidentFilter = "active";


async function loadIncidents() {
    const data = await fetchData("/api/incidents");

    const navCount = document.querySelector(".nav-count");

    allIncidents = data.incidents || [];

    if (navCount) {
        navCount.textContent = allIncidents.length
            .toString()
            .padStart(2, "0");
    }

    // Calculate counts for each filter.
    const activeStatuses = [
        "reported",
        "triaged",
        "investigating",
        "contained"
    ];

    const getStatus = incident =>
        String(incident.status_name).toLowerCase();

    const activeCount = allIncidents.filter(
        incident => activeStatuses.includes(getStatus(incident))
    ).length;

    const resolvedCount = allIncidents.filter(
        incident => getStatus(incident) === "resolved"
    ).length;

    const closedCount = allIncidents.filter(
        incident => getStatus(incident) === "closed"
    ).length;

    document.getElementById("active-count").textContent = activeCount;
    document.getElementById("resolved-count").textContent = resolvedCount;
    document.getElementById("closed-count").textContent = closedCount;

    renderIncidentTable();
}

// 3. Investigations workspace
let allInvestigations = [];

async function loadInvestigations() {
    const container = document.getElementById("investigations-list");

    container.innerHTML = `
        <p class="loading-cell">Loading investigations...</p>
    `;

    try {
        const data = await fetchData("/api/investigations");

        allInvestigations = data.investigations || [];

        // Connect the filters to the rendering function.
        document.getElementById("investigation-status-filter")
            .onchange = renderInvestigations;

        document.getElementById("investigation-severity-filter")
            .onchange = renderInvestigations;
        document.getElementById("investigation-search")
            .oninput = renderInvestigations;

        renderInvestigations();

    } catch (error) {
        console.error("Unable to load investigations:", error);

        container.innerHTML = `
            <p class="empty-state">
                Unable to load investigations. Please try again.
            </p>
        `;
    }
}


function renderInvestigations() {
    const container = document.getElementById("investigations-list");

    const selectedStatus =
        document.getElementById("investigation-status-filter").value;

    const selectedSeverity =
        document.getElementById("investigation-severity-filter").value;
    const searchTerm = document.getElementById("investigation-search")
        .value.trim().toLowerCase();

    const filteredInvestigations = allInvestigations.filter(incident => {
        const searchableText = [
            incident.incident_code,
            incident.title,
            incident.category_name
        ].join(" ").toLowerCase();

        const matchesSearch = searchableText.includes(searchTerm);

        const matchesStatus =
            selectedStatus === "all" ||
            incident.status_name === selectedStatus;

        const matchesSeverity =
            selectedSeverity === "all" ||
            incident.severity_name === selectedSeverity;

        return matchesStatus && matchesSeverity && matchesSearch;
    });

    if (filteredInvestigations.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No matching investigations</h3>
                <p>
                    Try changing or clearing the selected filters.
                </p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="investigations-list-header">
            <span>${filteredInvestigations.length} investigation(s)</span>
        </div>

        <div class="investigation-records">
            ${filteredInvestigations.map(incident => `
                <button
                    type="button"
                    class="investigation-record"
                    data-incident-id="${Number(incident.incident_id)}"
                >
                    <div class="investigation-record-main">

                        <div class="investigation-record-heading">
                            <strong>
                                ${escapeHTML(incident.incident_code)}
                            </strong>

                            <span class="severity severity-${escapeHTML(
                                incident.severity_name
                            ).toLowerCase()}">
                                ${escapeHTML(incident.severity_name)}
                            </span>
                        </div>

                        <h3>${escapeHTML(incident.title)}</h3>

                        <p>
                            ${escapeHTML(incident.category_name)}
                            <span>·</span>
                            ${escapeHTML(incident.assigned_analyst || "Unassigned")}
                        </p>

                    </div>

                    <div class="investigation-record-side">
                        <span class="investigation-status">
                            ${escapeHTML(incident.status_name)}
                        </span>

                        <small>
                            Updated ${escapeHTML(formatDate(incident.updated_at))}
                        </small>
                    </div>
                </button>
            `).join("")}
        </div>
    `;

    container.querySelectorAll(".investigation-record").forEach(record => {
        record.addEventListener("click", () => {
            const incidentId = Number(record.dataset.incidentId);
            openIncidentDetails(incidentId);
        });
    });
}


function renderIncidentTable() {
    const tableBody = document.getElementById("incident-table-body");

    const activeStatuses = [
        "reported",
        "triaged",
        "investigating",
        "contained"
    ];

    // First, filter incidents according to the selected status tab.
    const filteredIncidents = allIncidents.filter(incident => {
        const status = String(incident.status_name).toLowerCase();

        if (activeIncidentFilter === "active") {
            return activeStatuses.includes(status);
        }

        if (activeIncidentFilter === "resolved") {
            return status === "resolved";
        }

        if (activeIncidentFilter === "closed") {
            return status === "closed";
        }

        return false;
    });

    // Overview displays only 10; Incident Queue displays everything.
    const isQueueView = currentView === "incidents";

    const displayedIncidents = isQueueView
        ? filteredIncidents
        : filteredIncidents.slice(0, 9);

    if (displayedIncidents.length === 0) {
        const emptyMessages = {
            active: "No active incidents.",
            resolved: "No resolved incidents.",
            closed: "No closed incidents."
        };

        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="loading-cell">
                    ${emptyMessages[activeIncidentFilter]}
                </td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = displayedIncidents.map(incident => `
        <tr class="incident-row"
            data-incident-id="${Number(incident.incident_id)}"
            tabindex="0"
            role="button"
            aria-label="View incident ${escapeHTML(incident.incident_code)}">

            <td class="reference">
                ${escapeHTML(incident.incident_code)}
            </td>
            <td>
                <strong class="incident-title">
                    ${escapeHTML(incident.title)}
                </strong>
                <small class="incident-category">
                    ${escapeHTML(incident.category_name)}
                </small>
            </td>
            <td>
                <span class="severity severity-${escapeHTML(incident.severity_name).toLowerCase()}">
                    ${escapeHTML(incident.severity_name)}
                </span>
            </td>
            <td>
                <span class="status status-${escapeHTML(incident.status_name).toLowerCase().replaceAll(" ", "-")}">
                    ${escapeHTML(incident.status_name)}
                </span>
            </td>
            <td>
                ${escapeHTML(incident.assigned_analyst || "Unassigned")}
            </td>
        </tr>
    `).join("");

    // Preserve existing incident-detail interactions.
    tableBody.querySelectorAll(".incident-row").forEach(row => {
        row.addEventListener("click", () => {
            openIncidentDetails(row.dataset.incidentId);
        });

        row.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openIncidentDetails(row.dataset.incidentId);
            }
        });
    });
}

function exportVisibleIncidents() {
    const activeStatuses = [
        "reported",
        "triaged",
        "investigating",
        "contained"
    ];

    const visibleIncidents = allIncidents.filter(incident => {
        const status = String(incident.status_name).toLowerCase();

        if (activeIncidentFilter === "active") {
            return activeStatuses.includes(status);
        }

        if (activeIncidentFilter === "resolved") {
            return status === "resolved";
        }

        if (activeIncidentFilter === "closed") {
            return status === "closed";
        }

        return false;
    });

    if (visibleIncidents.length === 0) {
        alert("There are no incidents to export in this tab.");
        return;
    }

    const columns = [
        ["Incident Reference", "incident_code"],
        ["Title", "title"],
        ["Category", "category_name"],
        ["Severity", "severity_name"],
        ["Status", "status_name"],
        ["Assigned Analyst", "assigned_analyst"]
    ];

    const escapeCSV = value => {
        let text = String(value ?? "");

        // Prevent spreadsheet formula injection.
        if (/^[\s]*[=+\-@]/.test(text)) {
            text = "'" + text;
        }

        return `"${text.replaceAll('"', '""')}"`;
    };

    const rows = [
        columns.map(column => escapeCSV(column[0])).join(","),
        ...visibleIncidents.map(incident =>
            columns.map(column =>
                escapeCSV(incident[column[1]])
            ).join(",")
        )
    ];

    const csvContent = "\uFEFF" + rows.join("\r\n");

    const blob = new Blob([csvContent], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `incidentbridge-${activeIncidentFilter}-${new Date().toISOString().slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
}

// 3. Analyst workload
async function loadAnalysts() {
    const data = await fetchData("/api/analysts/recommend");

    const container = document.getElementById("analyst-list");
    const analysts = data.all_analysts || [];

    if (analysts.length === 0) {
        container.innerHTML = `
            <p class="empty-state">No active analysts are available.</p>
        `;
        return;
    }

    const highestWorkload = Math.max(
        ...analysts.map(analyst => Number(analyst.open_incidents)),
        1
    );

    container.innerHTML = analysts.map(analyst => {
        const workload = Number(analyst.open_incidents);
        const percentage = (workload / highestWorkload) * 100;

        return `
            <div class="analyst-row">
                <div class="analyst-topline">
                    <span class="analyst-name">
                        ${escapeHTML(analyst.full_name)}
                    </span>
                    <span class="analyst-count">
                        ${workload} open
                    </span>
                </div>
                <div class="workload-track">
                    <div class="workload-fill"
                         style="width: ${percentage}%">
                    </div>
                </div>
            </div>
        `;
    }).join("");
}


// ==========================================
// ANALYST DIRECTORY
// ==========================================

let allDirectoryAnalysts = [];

async function loadAnalystDirectory() {
    const container = document.getElementById("analysts-directory-list");

    container.innerHTML = `
        <p class="loading-cell">Loading analyst directory...</p>
    `;

    try {
        const data = await fetchData("/api/analysts/directory");

        if (!data.success) {
            throw new Error("Unable to retrieve analyst directory.");
        }

        allDirectoryAnalysts = data.analysts || [];

        // Connect search and sorting controls.
        document.getElementById("analyst-search").oninput =
            renderAnalystDirectory;

        document.getElementById("analyst-sort").onchange =
            renderAnalystDirectory;

        renderAnalystDirectory();

    } catch (error) {
        console.error("Analyst directory error:", error);

        container.innerHTML = `
            <p class="empty-state">
                Unable to load the analyst directory. Please try again.
            </p>
        `;
    }
}


function renderAnalystDirectory() {
    const container = document.getElementById("analysts-directory-list");

    const searchTerm = document.getElementById("analyst-search")
        .value.trim().toLowerCase();

    const sortBy = document.getElementById("analyst-sort").value;

    const filteredAnalysts = allDirectoryAnalysts.filter(analyst => {
        const searchableText = [
            analyst.full_name,
            analyst.email
        ].join(" ").toLowerCase();

        return searchableText.includes(searchTerm);
    });

    // Update summary metrics using the complete directory,
    // not just the search results.
    document.getElementById("analyst-total-count").textContent =
        allDirectoryAnalysts.length;

    document.getElementById("analyst-active-count").textContent =
        allDirectoryAnalysts.filter(
            analyst => Number(analyst.is_active) === 1
        ).length;

    document.getElementById("analyst-open-count").textContent =
        allDirectoryAnalysts.reduce(
            (total, analyst) => total + Number(analyst.open_incidents),
            0
        );

    document.getElementById("analyst-resolved-count").textContent =
        allDirectoryAnalysts.reduce(
            (total, analyst) => total + Number(analyst.resolved_incidents),
            0
        );

    // Sort a copy so the original API data remains unchanged.
    const sortedAnalysts = [...filteredAnalysts];

    if (sortBy === "workload") {
        sortedAnalysts.sort(
            (a, b) => Number(a.open_incidents) - Number(b.open_incidents)
        );
    } else if (sortBy === "name") {
        sortedAnalysts.sort(
            (a, b) => a.full_name.localeCompare(b.full_name)
        );
    } else if (sortBy === "resolved") {
        sortedAnalysts.sort(
            (a, b) => Number(b.resolved_incidents) -
                      Number(a.resolved_incidents)
        );
    }

    if (sortedAnalysts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No analysts found</h3>
                <p>Try another name or email address.</p>
            </div>
        `;
        return;
    }

    const highestWorkload = Math.max(
        ...sortedAnalysts.map(
            analyst => Number(analyst.open_incidents)
        ),
        1
    );

    container.innerHTML = sortedAnalysts.map(analyst => {
        const open = Number(analyst.open_incidents);
        const resolved = Number(analyst.resolved_incidents);
        const closed = Number(analyst.closed_incidents);

        const percentage = (open / highestWorkload) * 100;

        const isActive = Number(analyst.is_active) === 1;

        return `
            <article class="analyst-directory-card">

                <div class="analyst-card-header">
                    <div class="analyst-identity">
                        <div class="analyst-directory-avatar">
                            ${escapeHTML(
                                analyst.full_name.charAt(0).toUpperCase()
                            )}
                        </div>

                        <div>
                            <h3>${escapeHTML(analyst.full_name)}</h3>
                            <p>${escapeHTML(analyst.email)}</p>
                        </div>
                    </div>

                    <span class="analyst-account-status ${
                        isActive ? "is-active" : "is-inactive"
                    }">
                        ${isActive ? "Active" : "Inactive"}
                    </span>
                </div>

                <div class="analyst-workload-section">
                    <div class="analyst-workload-heading">
                        <span>Open workload</span>
                        <strong>${open} incidents</strong>
                    </div>

                    <div class="workload-track">
                        <div
                            class="workload-fill"
                            style="width: ${percentage}%"
                        ></div>
                    </div>
                </div>

                <div class="analyst-card-stats">
                    <div>
                        <strong>${resolved}</strong>
                        <span>Resolved</span>
                    </div>

                    <div>
                        <strong>${closed}</strong>
                        <span>Closed</span>
                    </div>

                    <div>
                        <strong>${Number(analyst.total_assigned)}</strong>
                        <span>Total assigned</span>
                    </div>
                </div>

            </article>
        `;
    }).join("");
}

// 4. Recent activity
async function loadActivity() {
    const data = await fetchData("/api/activity");

    const container = document.getElementById("activity-list");
    const activities = data.activities || [];

    if (activities.length === 0) {
        container.innerHTML = `
            <p class="empty-state">No activity recorded yet.</p>
        `;
        return;
    }

    container.innerHTML = activities.map(activity => `
        <div class="activity-entry">
            <div class="activity-entry-top">
                <strong>
                    ${escapeHTML(activity.incident_code || "Incident")}
                </strong>
                <time>${escapeHTML(formatDate(activity.created_at))}</time>
            </div>
            <p>${escapeHTML(activity.activity_description || activity.activity_type)}</p>
            <small>
                By ${escapeHTML(activity.performed_by || "System")}
            </small>
        </div>
    `).join("");
}


// ==========================================
// REPORTS
// ==========================================

let latestReportData = null;

function getLocalDateInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getReportsDateRange() {
    const range = document.getElementById("reports-range").value;

    if (range === "all") return { dateFrom: "", dateTo: "" };

    if (range === "custom") {
        return {
            dateFrom: document.getElementById("reports-date-from").value,
            dateTo: document.getElementById("reports-date-to").value
        };
    }

    const today = new Date();
    const dateTo = getLocalDateInputValue(today);
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    start.setDate(start.getDate() - (Number(range) - 1));

    return {
        dateFrom: getLocalDateInputValue(start),
        dateTo
    };
}

function formatReportDate(value) {
    if (!value) return "—";

    // Preserve the calendar day for both ISO dates and legacy GMT date strings.
    const match = String(value).match(/(\d{4})-(\d{2})-(\d{2})/);
    let year, month, day;

    if (match) {
        year = Number(match[1]);
        month = Number(match[2]) - 1;
        day = Number(match[3]);
    } else {
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return "—";
        year = parsed.getUTCFullYear();
        month = parsed.getUTCMonth();
        day = parsed.getUTCDate();
    }

    return new Date(year, month, day).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short"
    });
}

function renderReportBreakdown(containerId, rows, labelKey, options = {}) {
    const container = document.getElementById(containerId);
    const values = rows || [];

    if (!values.length) {
        container.innerHTML = '<p class="empty-state">No data for this reporting period.</p>';
        return;
    }

    const maxValue = Math.max(...values.map(row => Number(row.incident_count) || 0), 1);
    const total = values.reduce((sum, row) => sum + (Number(row.incident_count) || 0), 0);

    container.innerHTML = values.map(row => {
        const count = Number(row.incident_count) || 0;
        const width = Math.max(0, Math.min(100, (count / maxValue) * 100));
        const label = escapeHTML(row[labelKey] || "Unclassified");
        const percentage = total ? ((count / total) * 100).toFixed(1) : "0.0";

        return `
            <div class="report-bar-row">
                <div class="report-bar-label">
                    <span>${label}</span>
                    <strong>${count}</strong>
                </div>
                <div class="report-bar-track">
                    <span class="report-bar-fill ${options.className || ""}"
                          style="width: ${width}%"></span>
                </div>
                <small>${percentage}% of incidents</small>
            </div>
        `;
    }).join("");
}

function renderReportTrend(rows) {
    const container = document.getElementById("report-trend");
    const values = rows || [];

    if (!values.length) {
        container.innerHTML = '<p class="empty-state">No incidents recorded in this period.</p>';
        return;
    }

    const maxValue = Math.max(...values.map(row => Number(row.incident_count) || 0), 1);
    const ordered = [...values].sort((a, b) =>
        String(a.incident_date).localeCompare(String(b.incident_date))
    );

    container.innerHTML = `
        <div class="report-trend-chart">
            ${ordered.map(row => {
                const count = Number(row.incident_count) || 0;
                const height = Math.max(5, (count / maxValue) * 100);
                return `
                    <div class="report-trend-column" title="${count} incidents">
                        <strong>${count}</strong>
                        <div class="report-trend-bar-wrap">
                            <span class="report-trend-bar" style="height:${height}%"></span>
                        </div>
                        <small>${escapeHTML(formatReportDate(row.incident_date))}</small>
                    </div>
                `;
            }).join("")}
        </div>
        <div class="report-trend-caption">
            <span>${ordered.length} reporting date(s)</span>
            <span>Daily incident count</span>
        </div>
    `;
}

function renderReportWorkload(rows) {
    const container = document.getElementById("report-workload");
    const analysts = rows || [];

    if (!analysts.length) {
        container.innerHTML = '<tr><td colspan="5" class="loading-cell">No analyst workload data for this period.</td></tr>';
        return;
    }

    container.innerHTML = analysts.map(analyst => {
        const open = Number(analyst.open_incidents) || 0;
        const resolved = Number(analyst.resolved_incidents) || 0;
        const closed = Number(analyst.closed_incidents) || 0;
        const total = open + resolved + closed;

        return `
            <tr>
                <td><strong>${escapeHTML(analyst.full_name)}</strong></td>
                <td>${open}</td>
                <td>${resolved}</td>
                <td>${closed}</td>
                <td><strong>${total}</strong></td>
            </tr>
        `;
    }).join("");
}

function renderReports(data) {
    const summary = data.summary || {};

    document.getElementById("report-total").textContent =
        Number(summary.total_incidents) || 0;
    document.getElementById("report-open").textContent =
        Number(summary.open_incidents) || 0;
    document.getElementById("report-completed").textContent =
        Number(summary.completed_incidents) || 0;

    const completionRate = summary.completion_rate ?? summary.resolution_rate ?? 0;
    document.getElementById("report-completion-rate").textContent =
        `${Number(completionRate).toFixed(1)}%`;

    renderReportTrend(data.incident_trend);
    renderReportBreakdown("report-severity", data.by_severity, "severity_name");
    renderReportBreakdown("report-category", data.by_category, "category_name");
    renderReportBreakdown("report-status", data.by_status, "status_name");
    renderReportWorkload(data.analyst_workload);
}

async function loadReports() {
    const message = document.getElementById("reports-message");
    message.textContent = "";

    const range = getReportsDateRange();
    const rangeSelector = document.getElementById("reports-range");

    if (rangeSelector.value === "custom" && (!range.dateFrom || !range.dateTo)) {
        message.textContent = "Select both a start date and an end date.";
        return;
    }

    if (range.dateFrom && range.dateTo && range.dateFrom > range.dateTo) {
        message.textContent = "The start date must be on or before the end date.";
        return;
    }

    const params = new URLSearchParams();
    if (range.dateFrom) params.set("date_from", range.dateFrom);
    if (range.dateTo) params.set("date_to", range.dateTo);

    const periodLabel = range.dateFrom && range.dateTo
        ? `${range.dateFrom} to ${range.dateTo}`
        : "All recorded incidents";
    document.getElementById("reports-period-label").textContent = periodLabel;

    const containers = [
        "report-trend", "report-severity", "report-category", "report-status"
    ];
    containers.forEach(id => {
        document.getElementById(id).innerHTML =
            '<p class="loading-cell">Loading report data...</p>';
    });
    document.getElementById("report-workload").innerHTML =
        '<tr><td colspan="5" class="loading-cell">Loading analyst workload...</td></tr>';

    try {
        const suffix = params.toString() ? `?${params.toString()}` : "";
        const data = await fetchData(`/api/reports/summary${suffix}`);

        if (!data.success) {
            throw new Error(data.message || "Unable to load reports.");
        }

        latestReportData = data;
        renderReports(data);
    } catch (error) {
        console.error("Reports loading error:", error);
        message.textContent = error.message || "Unable to load reports. Please try again.";
        containers.forEach(id => {
            document.getElementById(id).innerHTML =
                '<p class="empty-state">Report data could not be loaded.</p>';
        });
        document.getElementById("report-workload").innerHTML =
            '<tr><td colspan="5" class="loading-cell">Report data could not be loaded.</td></tr>';
    }
}

function exportReportsCSV() {
    if (!latestReportData) {
        alert("Load report data before exporting.");
        return;
    }

    const data = latestReportData;
    const lines = [];
    const csv = value => {
        let text = String(value ?? "");
        if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
        return `"${text.replaceAll('"', '""')}"`;
    };
    const addSection = (title, headers, rows) => {
        lines.push(csv(title));
        lines.push(headers.map(csv).join(","));
        rows.forEach(row => lines.push(row.map(csv).join(",")));
        lines.push("");
    };

    const summary = data.summary || {};
    addSection("Incident Summary",
        ["Metric", "Value"],
        [
            ["Total incidents", summary.total_incidents ?? 0],
            ["Open incidents", summary.open_incidents ?? 0],
            ["Completed incidents", summary.completed_incidents ?? 0],
            ["Completion rate (%)", summary.completion_rate ?? summary.resolution_rate ?? 0]
        ]
    );

    addSection("Incidents by Severity",
        ["Severity", "Incident count"],
        (data.by_severity || []).map(row => [row.severity_name, row.incident_count])
    );
    addSection("Incidents by Category",
        ["Category", "Incident count"],
        (data.by_category || []).map(row => [row.category_name, row.incident_count])
    );
    addSection("Incidents by Status",
        ["Status", "Incident count"],
        (data.by_status || []).map(row => [row.status_name, row.incident_count])
    );
    addSection("Daily Incident Trend",
        ["Date", "Incident count"],
        (data.incident_trend || []).map(row => [row.incident_date, row.incident_count])
    );
    addSection("Analyst Workload",
        ["Analyst", "Open", "Resolved", "Closed"],
        (data.analyst_workload || []).map(row => [
            row.full_name, row.open_incidents, row.resolved_incidents, row.closed_incidents
        ])
    );

    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
        type: "text/csv;charset=utf-8;"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `incidentbridge-report-${getLocalDateInputValue(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function initializeReportsControls() {
    const range = document.getElementById("reports-range");
    const customRange = document.getElementById("reports-custom-range");

    range.addEventListener("change", () => {
        customRange.hidden = range.value !== "custom";
        if (range.value !== "custom") loadReports();
    });

    document.getElementById("reports-date-from").addEventListener("change", () => {
        if (range.value === "custom") loadReports();
    });
    document.getElementById("reports-date-to").addEventListener("change", () => {
        if (range.value === "custom") loadReports();
    });
    document.getElementById("reports-refresh").addEventListener("click", loadReports);
    document.getElementById("reports-export").addEventListener("click", exportReportsCSV);
}


// ==========================================
// AUTHENTICATION AND APPLICATION STARTUP
// ==========================================

let currentUser = null;

const loginScreen = document.getElementById("login-screen");
const appShell = document.querySelector(".app-shell");
const loginForm = document.getElementById("login-form");
const loginMessage = document.getElementById("login-message");
const loginSubmitButton = document.getElementById("login-submit");


// Show the login screen
function showLoginScreen() {
    currentUser = null;

    appShell.hidden = true;
    loginScreen.hidden = false;
}

// Animate the dashboard out before showing the login screen
async function transitionToLoginScreen() {

    // Skip animation if the user prefers reduced motion
    const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReducedMotion || typeof appShell.animate !== "function") {
        showLoginScreen();
        return;
    }

    const exitAnimation = appShell.animate(
        [
            {
                opacity: 1,
                transform: "translateY(0)"
            },
            {
                opacity: 0,
                transform: "translateY(10px)"
            }
        ],
        {
            duration: 350,
            easing: "ease-in",
            fill: "forwards"
        }
    );

    try {
        await exitAnimation.finished;
    } catch (error) {
        // Continue to the login screen even if animation is interrupted
    }

    exitAnimation.cancel();
    showLoginScreen();
}

// Show the authenticated dashboard
async function showDashboard(user) {
    currentUser = user;

    loginScreen.hidden = true;
    appShell.hidden = false;

    // Display the authenticated user's details
    const userName = document.querySelector(".user-info strong");
    const userRole = document.querySelector(".user-info small");
    const userAvatar = document.querySelector(".user-avatar");

    if (userName) {
        userName.textContent = user.full_name;
    }

    if (userRole) {
        const roleNames = {
            1: "Reporter",
            2: "Security Analyst",
            3: "Administrator"
        };

        userRole.textContent = roleNames[user.role_id] || "User";
    }

    if (userAvatar) {
        userAvatar.textContent = user.full_name.charAt(0).toUpperCase();
    }

    // Apply role-based dashboard visibility
    const roleId = Number(user.role_id);

    // Control navigation visibility by role
    document.querySelectorAll("[data-role-access='analyst']")
        .forEach(item => {
            item.hidden = (roleId === 1);
        });

    const analystPanel = document.querySelector(".analyst-panel");
    const activityPanel = document.querySelector(".activity-panel");

    // Reporters cannot access global analyst workload or activity
    if (roleId === 1) {
        analystPanel.hidden = true;
        activityPanel.hidden = true;
    } else {
        analystPanel.hidden = false;
        activityPanel.hidden = false;
    }

    // Security Analysts cannot report new incidents
    reportButton.hidden = (roleId === 2);

    // Load only the sections this role can access
    await initializeDashboard(roleId);
}


// Load dashboard sections independently
async function initializeDashboard(roleId) {

    const sections = [
        ["summary", loadSummary],
        ["incidents", loadIncidents]
    ];

    // Analysts and Administrators can access these sections
    if (roleId === 2 || roleId === 3) {
        sections.push(
            ["analysts", loadAnalysts],
            ["activity", loadActivity]
        );
    }

    await Promise.all(
        sections.map(async ([name, loader]) => {
            try {
                await loader();
            } catch (error) {
                console.error(`Failed to load ${name}:`, error);
            }
        })
    );
}

async function refreshDashboardData() {
    const tasks = [
        loadSummary(),
        loadIncidents()
    ];

    const roleId = Number(currentUser.role_id);

    if (roleId === 2 || roleId === 3) {
        tasks.push(loadAnalysts());
        tasks.push(loadActivity());
    }

    await Promise.all(tasks);
}

// Check whether the user already has an active session
async function checkAuthentication() {
    try {
        const response = await fetch("/api/auth/me");

        if (!response.ok) {
            showLoginScreen();
            return;
        }

        const data = await response.json();

        if (!data.success || !data.user) {
            showLoginScreen();
            return;
        }

        await showDashboard(data.user);

    } catch (error) {
        console.error("Authentication check failed:", error);
        showLoginScreen();
    }
}


// Handle login form submission
async function handleLogin(event) {
    event.preventDefault();

    loginMessage.textContent = "";
    loginMessage.classList.remove("success");

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    loginSubmitButton.disabled = true;
    loginSubmitButton.textContent = "Signing in...";

    try {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Login failed.");
        }

        loginForm.reset();

        await showDashboard(data.user);

    } catch (error) {
        console.error("Login error:", error);
        loginMessage.textContent = error.message;

    } finally {
        loginSubmitButton.disabled = false;
        loginSubmitButton.textContent = "Sign in";
    }
}

// Handle user logout
async function handleLogout() {
    const logoutButton = document.getElementById("logout-button");

    logoutButton.disabled = true;

    try {
        const response = await fetch("/api/auth/logout", {
            method: "POST"
        });

        if (!response.ok) {
            throw new Error("Unable to log out. Please try again.");
        }

        loginForm.reset();
        loginMessage.textContent = "";

        await transitionToLoginScreen();

    } catch (error) {
        console.error("Logout error:", error);
        alert(error.message);

    } finally {
        logoutButton.disabled = false;
    }
}

// Start the application only after the HTML is ready
document.addEventListener("DOMContentLoaded", () => {
    loginForm.addEventListener("submit", handleLogin);

    document
        .getElementById("logout-button")
        .addEventListener("click", handleLogout);

    checkAuthentication();
});

// ==========================================
// APPEARANCE / LIGHT-DARK THEME
// ==========================================

const themeToggleButton = document.getElementById("theme-toggle");
const savedTheme = localStorage.getItem("incidentbridge-theme");
const initialTheme = savedTheme === "dark" ? "dark" : "light";

function applyTheme(theme) {
    const activeTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", activeTheme);

    if (themeToggleButton) {
        const nextTheme = activeTheme === "dark" ? "light" : "dark";
        const label = activeTheme === "dark" ? "Light mode" : "Dark mode";
        const icon = activeTheme === "dark" ? "☼" : "◐";

        themeToggleButton.setAttribute(
            "aria-label",
            `Switch to ${nextTheme} mode`
        );
        themeToggleButton.setAttribute(
            "title",
            `Switch to ${nextTheme} mode`
        );

        const iconElement = themeToggleButton.querySelector(
            ".theme-toggle-icon"
        );
        const labelElement = themeToggleButton.querySelector(
            ".theme-toggle-label"
        );

        if (iconElement) iconElement.textContent = icon;
        if (labelElement) labelElement.textContent = label;
    }
}

applyTheme(initialTheme);

if (themeToggleButton) {
    themeToggleButton.addEventListener("click", () => {
        const currentTheme =
            document.documentElement.getAttribute("data-theme") || "light";
        const nextTheme = currentTheme === "dark" ? "light" : "dark";

        // Calculate the circular reveal origin from the theme button.
        const buttonBounds = themeToggleButton.getBoundingClientRect();

        const revealX = buttonBounds.left + buttonBounds.width / 2;
        const revealY = buttonBounds.top + buttonBounds.height / 2;

        const root = document.documentElement;

        // Calculate the radius required to cover the entire screen.
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        const revealRadius = Math.max(
            Math.hypot(revealX, revealY),
            Math.hypot(screenWidth - revealX, revealY),
            Math.hypot(revealX, screenHeight - revealY),
            Math.hypot(screenWidth - revealX, screenHeight - revealY)
        );

        root.style.setProperty("--theme-reveal-x", `${revealX}px`);
        root.style.setProperty("--theme-reveal-y", `${revealY}px`);
        root.style.setProperty("--theme-reveal-radius", `${revealRadius}px`);
        localStorage.setItem("incidentbridge-theme", nextTheme);

        // Chrome/Edge support the View Transitions API. The fallback below
        // still gives a smooth colour transition in browsers that do not.
        if (typeof document.startViewTransition === "function") {
            document.startViewTransition(() => applyTheme(nextTheme));
        } else {
            root.classList.add("theme-transitioning");
            applyTheme(nextTheme);
            window.setTimeout(() => {
                root.classList.remove("theme-transitioning");
            }, 700);
        }
    });
}


// ==========================================
// INCIDENT REPORT MODAL
// ==========================================

const reportModal = document.getElementById("report-modal");
const reportForm = document.getElementById("report-form");
const reportButton = document.getElementById("report-incident-btn");
const closeReportButton = document.getElementById("close-report-modal");
const cancelReportButton = document.getElementById("cancel-report");
const reportMessage = document.getElementById("report-message");
const submitReportButton = document.getElementById("submit-report");


// Load categories and severity levels from the database
async function loadIncidentOptions() {
    try {
        const data = await fetchData("/api/incident-options");

        if (!data.success) {
            throw new Error("Could not load incident options.");
        }

        const categorySelect = document.getElementById("incident-category");
        const severitySelect = document.getElementById("incident-severity");

        categorySelect.innerHTML =
            '<option value="">Select category</option>';

        severitySelect.innerHTML =
            '<option value="">Select severity</option>';

        data.categories.forEach(category => {
            const option = document.createElement("option");
            option.value = category.category_id;
            option.textContent = category.category_name;
            categorySelect.appendChild(option);
        });

        data.severities.forEach(level => {
            const option = document.createElement("option");
            option.value = level.severity_id;
            option.textContent = level.severity_name;
            severitySelect.appendChild(option);
        });

    } catch (error) {
        console.error("Incident options error:", error);
        reportMessage.textContent =
            "Unable to load categories and severity levels.";
    }
}


// Open modal
async function openReportModal() {
    reportMessage.textContent = "";
    reportMessage.classList.remove("success");

    reportModal.showModal();

    await loadIncidentOptions();
}


// Close modal
function closeReportModal() {
    reportModal.close();
}


// Submit incident
async function submitIncidentReport(event) {
    event.preventDefault();

    const formData = new FormData(reportForm);

    const incidentData = {
        title: formData.get("title").trim(),
        description: formData.get("description").trim(),
        category_id: Number(formData.get("category_id")),
        severity_id: Number(formData.get("severity_id"))
    };

    if (!incidentData.title || !incidentData.description ||
        !incidentData.category_id || !incidentData.severity_id) {
        reportMessage.textContent =
            "Please complete all fields.";
        return;
    }

    submitReportButton.disabled = true;
    submitReportButton.textContent = "Submitting...";

    reportMessage.textContent = "";
    reportMessage.classList.remove("success");

    try {
        const response = await fetch("/api/incidents/report", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(incidentData)
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || "Incident submission failed.");
        }

        reportMessage.textContent =
            `Incident ${result.incident_code} reported successfully.`;

        reportMessage.classList.add("success");

        reportForm.reset();

        // Refresh dashboard data
        await refreshDashboardData();

        // Close after a short delay so the success message is visible
        setTimeout(() => {
            closeReportModal();
        }, 1200);

    } catch (error) {
        console.error("Incident submission error:", error);
        reportMessage.textContent = error.message;

    } finally {
        submitReportButton.disabled = false;
        submitReportButton.textContent = "Submit incident";
    }
}


// Connect buttons and form events
reportButton.addEventListener("click", openReportModal);

closeReportButton.addEventListener("click", closeReportModal);

cancelReportButton.addEventListener("click", closeReportModal);

reportForm.addEventListener("submit", submitIncidentReport);


// ==========================================
// INCIDENT DETAIL VIEW
// ==========================================

const incidentDetailModal =
    document.getElementById("incident-detail-modal");

const closeIncidentDetailsButton =
    document.getElementById("close-incident-details");

const detailIncidentCode =
    document.getElementById("detail-incident-code");

const incidentDetailContent =
    document.getElementById("incident-detail-content");



async function openIncidentDetails(incidentId) {

    incidentDetailModal.showModal();

    detailIncidentCode.textContent = "Loading...";

    incidentDetailContent.innerHTML = `
        <p class="loading-cell">Loading incident record...</p>
    `;

    try {
        const data = await fetchData(`/api/incidents/${incidentId}`);

        if (!data.success) {
            throw new Error("Unable to retrieve incident details.");
        }

        const incident = data.incident;

        const roleId = Number(currentUser.role_id);
        const isReporter = roleId === 1;
        const isAnalyst = roleId === 2;
        const isAdmin = roleId === 3;

        const isAssignedAnalyst =
            isAnalyst &&
            Number(incident.assigned_to) === Number(currentUser.user_id);

        const canUpdateStatus = isAdmin || isAssignedAnalyst;
        const canAssignIncident = isAdmin;
        const canViewInvestigation =
            isAdmin || isAssignedAnalyst;

        const nextStatusMap = {
            "Reported": { id: 2, name: "Triaged" },
            "Triaged": { id: 3, name: "Investigating" },
            "Investigating": { id: 4, name: "Contained" },
            "Contained": { id: 5, name: "Resolved" },
            "Resolved": { id: 6, name: "Closed" }
        };

        const nextStatus = nextStatusMap[incident.status_name];

        detailIncidentCode.textContent = incident.incident_code;

        incidentDetailContent.innerHTML = `
            <section class="detail-section">
                <h3>Incident overview</h3>

                <h2 class="detail-title">
                    ${escapeHTML(incident.title)}
                </h2>

                <div class="detail-meta">
                    <div class="detail-meta-item">
                        <span>Severity</span>
                        <strong>
                            <span class="severity severity-${escapeHTML(incident.severity_name).toLowerCase()}">
                                ${escapeHTML(incident.severity_name)}
                            </span>
                        </strong>
                    </div>

                    <div class="detail-meta-item">
                        <span>Status</span>
                        <strong>${escapeHTML(incident.status_name)}</strong>
                    </div>

                    <div class="detail-meta-item">
                        <span>Category</span>
                        <strong>${escapeHTML(incident.category_name)}</strong>
                    </div>

                    <div class="detail-meta-item">
                        <span>Assigned analyst</span>
                        <strong id="current-assignee">
                            ${escapeHTML(incident.assigned_analyst || "Unassigned")}
                        </strong>
                    </div>

                    <div class="detail-meta-item">
                        <span>Reported by</span>
                        <strong>${escapeHTML(incident.reported_by)}</strong>
                    </div>

                    <div class="detail-meta-item">
                        <span>Reported on</span>
                        <strong>${escapeHTML(formatDate(incident.created_at))}</strong>
                    </div>
                </div>
            </section>

            <section class="detail-section">
                <h3>Incident description</h3>

                <div class="detail-description-box">
                    <p class="detail-description">
                        ${escapeHTML(incident.description)}
                    </p>
                </div>
            </section>

            ${canViewInvestigation ? `
                <section class="detail-section">
                    <h3>Investigation log</h3>

                    <div id="investigation-notes-list">
                        <p class="loading-cell">
                            Loading investigation notes...
                        </p>
                    </div>

                    <div class="note-form">
                        <label for="investigation-note-input">
                            Add investigation note
                        </label>

                        <textarea
                            id="investigation-note-input"
                            placeholder="Record findings, evidence reviewed, actions taken and next steps..."
                            rows="4"
                        ></textarea>

                        <button
                            type="button"
                            class="assignment-submit"
                            id="add-investigation-note"
                        >
                            Add note
                        </button>

                        <p
                            id="note-feedback"
                            class="assignment-feedback"
                            role="status"
                        ></p>
                    </div>
                </section>
            ` : ""}

            <section class="detail-section">
                <h3>Timeline information</h3>

                <div class="detail-meta">
                    <div class="detail-meta-item">
                        <span>Last updated</span>
                        <strong>${escapeHTML(formatDate(incident.updated_at))}</strong>
                    </div>

                    <div class="detail-meta-item">
                        <span>Resolved on</span>
                        <strong>${escapeHTML(formatDate(incident.resolved_at))}</strong>
                    </div>
                </div>
            </section>

            ${canUpdateStatus ? `
                <section class="detail-section">
                    <h3>Status management</h3>

                    <div class="assignment-panel">

                        <div class="assignment-recommendation">
                            <div>
                                <small>Current status</small>
                                <strong>${escapeHTML(incident.status_name)}</strong>
                            </div>

                            <span class="recommendation-count">
                                ${nextStatus ? "Action available" : "Final status"}
                            </span>
                        </div>

                        ${nextStatus ? `
                            <label for="next-status-select">Move incident to</label>

                            <select id="next-status-select">
                                <option value="${nextStatus.id}">
                                    ${escapeHTML(nextStatus.name)}
                                </option>
                            </select>

                            <button
                                type="button"
                                class="assignment-submit"
                                id="confirm-status-update"
                            >
                                Update status
                            </button>

                            <p
                                id="status-update-feedback"
                                class="assignment-feedback"
                                role="status"
                            ></p>
                        ` : `
                            <p class="assignment-feedback">
                                This incident has reached its final status.
                            </p>
                        `}

                    </div>
                </section>
            ` : ""}
            
            
            ${canAssignIncident ? `
                <section class="detail-section">
                    <h3>Analyst assignment</h3>

                    <div class="assignment-panel">

                        <div class="assignment-recommendation">
                            <div>
                                <small>Current assignment</small>
                                <strong>
                                    ${escapeHTML(incident.assigned_analyst || "Unassigned")}
                                </strong>
                            </div>

                            <span class="recommendation-count">
                                ${incident.assigned_analyst ? "Assigned" : "Unassigned"}
                            </span>
                        </div>

                        <div class="assignment-recommendation">
                            <div>
                                <small>Recommended analyst</small>
                                <strong id="recommended-analyst">Loading...</strong>
                            </div>

                            <span
                                class="recommendation-count"
                                id="recommended-workload"
                            ></span>
                        </div>

                        <label for="analyst-select">
                            ${incident.assigned_analyst
                                ? "Reassign to analyst"
                                : "Assign to analyst"}
                        </label>

                        <select id="analyst-select">
                            <option value="">Loading analysts...</option>
                        </select>

                        <button
                            type="button"
                            class="assignment-submit"
                            id="confirm-assignment"
                        >
                            ${incident.assigned_analyst
                                ? "Confirm reassignment"
                                : "Confirm assignment"}
                        </button>

                        <p
                            id="assignment-feedback"
                            class="assignment-feedback"
                            role="status"
                        ></p>

                    </div>
                </section>
            ` : ""}
        `;

        const statusUpdateButton = document.getElementById(
            "confirm-status-update"
        );

        if (statusUpdateButton) {
            statusUpdateButton.addEventListener("click", async () => {

                const statusSelect = document.getElementById(
                    "next-status-select"
                );

                const feedback = document.getElementById(
                    "status-update-feedback"
                );

                const newStatusId = Number(statusSelect.value);

                statusUpdateButton.disabled = true;
                statusUpdateButton.textContent = "Updating...";

                try {
                    const response = await fetch(
                        "/api/incidents/update-status",
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                incident_id: Number(incidentId),
                                status_id: newStatusId
                            })
                        }
                    );

                    const result = await response.json();

                    if (!response.ok || !result.success) {
                        throw new Error(
                            result.message || "Status update failed."
                        );
                    }

                    feedback.textContent = result.message;
                    feedback.className = "assignment-feedback success";

                    await Promise.all([
                        loadSummary(),
                        loadIncidents(),
                        loadAnalysts(),
                        loadActivity(),
                        loadInvestigations()
                    ]);

                    await openIncidentDetails(incidentId);

                } catch (error) {
                    console.error("Status update error:", error);

                    feedback.textContent = error.message;
                    feedback.className = "assignment-feedback error";

                    statusUpdateButton.disabled = false;
                    statusUpdateButton.textContent = "Update status";
                }
            });
        }

        if (canViewInvestigation) {
            await loadInvestigationNotes(incidentId);

            document.getElementById(
                "add-investigation-note"
            ).addEventListener("click", () => {
                addInvestigationNote(incidentId);
            });
        }

        if (canAssignIncident) {
            await loadAssignmentOptions(
                incidentId,
                incident.assigned_to
            );
        }

    } catch (error) {
        console.error("Incident detail error:", error);

        detailIncidentCode.textContent = "Error";

        incidentDetailContent.innerHTML = `
            <p class="report-message">
                The incident record could not be loaded. Try again.
            </p>
        `;
    }
}


// Load analyst recommendations
async function loadAssignmentOptions(incidentId, currentAssignedTo = null) {

    const data = await fetchData("/api/analysts/recommend");

    if (!data.success || !data.all_analysts.length) {
        throw new Error("No active analysts are available.");
    }

    const analysts = data.all_analysts.filter(analyst =>
        currentAssignedTo === null ||
        Number(analyst.user_id) !== Number(currentAssignedTo)
    );

    const recommendation = analysts.length
        ? [...analysts].sort(
            (a, b) => a.open_incidents - b.open_incidents
        )[0]
        : null;

    const recommendedElement =
        document.getElementById("recommended-analyst");

    const workloadElement =
        document.getElementById("recommended-workload");

    const analystSelect =
        document.getElementById("analyst-select");

        if (!recommendation) {
        recommendedElement.textContent = "No alternative analyst available";
        workloadElement.textContent = "";

        analystSelect.innerHTML = `
            <option value="">No other active analysts available</option>
        `;

        analystSelect.disabled = true;

        document.getElementById("confirm-assignment").disabled = true;

        return;
    }

    recommendedElement.textContent = recommendation.full_name;

    workloadElement.textContent =
        `${recommendation.open_incidents} open incidents`;

    analystSelect.disabled = false;

    analystSelect.innerHTML = `
        <option value="">Select an analyst</option>

        ${analysts.map(analyst => `
            <option value="${Number(analyst.user_id)}">
                ${escapeHTML(analyst.full_name)}
                (${analyst.open_incidents} open)
            </option>
        `).join("")}
    `;

    analystSelect.value = String(recommendation.user_id);

    document.getElementById("confirm-assignment").disabled = false;

    document.getElementById("confirm-assignment")
        .addEventListener("click", () => {
            confirmIncidentAssignment(incidentId);
        });
}


// Confirm assignment
async function confirmIncidentAssignment(incidentId) {

    const analystSelect =
        document.getElementById("analyst-select");

    const feedback =
        document.getElementById("assignment-feedback");

    const confirmButton =
        document.getElementById("confirm-assignment");

    const analystId = Number(analystSelect.value);

    if (!analystId) {
        feedback.textContent = "Please select an analyst.";
        feedback.className = "assignment-feedback error";
        return;
    }

    confirmButton.disabled = true;
    confirmButton.textContent = "Assigning...";

    feedback.textContent = "";

    try {
        const response = await fetch("/api/incidents/assign", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                incident_id: Number(incidentId),
                analyst_id: analystId
            })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || "Assignment failed.");
        }

        feedback.textContent = "Incident assignment saved.";
        feedback.className = "assignment-feedback success";

        // Refresh dashboard and incident details
        await Promise.all([
            loadSummary(),
            loadIncidents(),
            loadAnalysts(),
            loadActivity()
        ]);

        await openIncidentDetails(incidentId);

    } catch (error) {
        feedback.textContent = error.message;
        feedback.className = "assignment-feedback error";

    } finally {
        // The drawer may have been re-rendered by openIncidentDetails.
        const currentButton =
            document.getElementById("confirm-assignment");

        if (currentButton) {
            currentButton.disabled = false;
            currentButton.textContent = "Confirm assignment";
        }
    }
}

// Close detail drawer
closeIncidentDetailsButton.addEventListener("click", () => {
    incidentDetailModal.close();
});

// Close incident drawer when clicking outside the panel
incidentDetailModal.addEventListener("click", (event) => {
    if (event.target === incidentDetailModal) {
        incidentDetailModal.close();
    }
});

async function loadInvestigationNotes(incidentId) {

    const notesContainer = document.getElementById(
        "investigation-notes-list"
    );

    try {
        const response = await fetch(
            `/api/incidents/${incidentId}/notes`
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error("Unable to load investigation notes.");
        }

        if (data.notes.length === 0) {
            notesContainer.innerHTML = `
                <p class="loading-cell">
                    No investigation notes have been added.
                </p>
            `;
            return;
        }

        notesContainer.innerHTML = data.notes.map(note => `
            <div class="investigation-note">

                <div class="note-header">
                    <strong>${escapeHTML(note.author_name)}</strong>

                    <small>
                        ${escapeHTML(formatDate(note.created_at))}
                    </small>
                </div>

                <p>
                    ${escapeHTML(note.note_content).replace(/\n/g, "<br>")}
                </p>

            </div>
        `).join("");

    } catch (error) {
        console.error("Investigation notes error:", error);

        notesContainer.innerHTML = `
            <p class="report-message">
                Unable to load investigation notes.
            </p>
        `;
    }
}

async function addInvestigationNote(incidentId) {

    const noteInput = document.getElementById(
        "investigation-note-input"
    );

    const feedback = document.getElementById(
        "note-feedback"
    );

    const submitButton = document.getElementById(
        "add-investigation-note"
    );

    const noteContent = noteInput.value.trim();

    if (!noteContent) {
        feedback.textContent = "Please enter an investigation note.";
        feedback.className = "assignment-feedback error";
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Saving...";

    try {
        const response = await fetch(
            `/api/incidents/${incidentId}/notes`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    note_content: noteContent
                })
            }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(
                result.message || "Unable to save investigation note."
            );
        }

        noteInput.value = "";

        feedback.textContent = "Investigation note added successfully.";
        feedback.className = "assignment-feedback success";

        await loadInvestigationNotes(incidentId);

    } catch (error) {
        console.error("Add investigation note error:", error);

        feedback.textContent = error.message;
        feedback.className = "assignment-feedback error";

    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Add note";
    }
}

function loadSettings() {
    if (!currentUser) return;

    const roleNames = {
        1: "Reporter",
        2: "Security Analyst",
        3: "Administrator"
    };

    document.getElementById("settings-name").textContent =
        currentUser.full_name;

    document.getElementById("settings-email").textContent =
        currentUser.email;

    document.getElementById("settings-role").textContent =
        roleNames[Number(currentUser.role_id)] || "Unknown";

    document.getElementById("settings-status").textContent =
        "Active";
}

// View all incidents link

const workspaceContent = document.querySelector(".workspace-content");
const overviewLink = document.getElementById("nav-overview");
const incidentsLink = document.getElementById("nav-incidents");
const viewAllIncidentsLink = document.getElementById("view-all-incidents");
const investigationsLink =
    document.getElementById("nav-investigations");
const analystsLink = document.getElementById("nav-analysts");
const reportsLink = document.getElementById("nav-reports");

let currentView = "overview";

function navigateToView(view) {
    currentView = view;
    document.querySelectorAll(".nav-item").forEach(item => {
        item.classList.remove("active");
    });

    workspaceContent.classList.toggle("queue-view", view === "incidents");
    workspaceContent.classList.toggle(
        "investigations-view",
        view === "investigations"
    );
    workspaceContent.classList.toggle(
        "analysts-view",
        view === "analysts"
    );
    workspaceContent.classList.toggle("reports-view", view === "reports");

    if (viewAllIncidentsLink) {
        viewAllIncidentsLink.textContent =
            view === "incidents"
                ? "Export CSV ↓"
                : "View all incidents →";
    }
    workspaceContent.classList.toggle("settings-view", view === "settings");

    const settingsView = document.getElementById("settings-view");
    settingsView.hidden = view !== "settings";
    const investigationsView =
    document.getElementById("investigations-view");

    const analystsView =
        document.getElementById("analysts-view");
    const reportsView =
        document.getElementById("reports-view");

    investigationsView.hidden = view !== "investigations";
    analystsView.hidden = view !== "analysts";
    reportsView.hidden = view !== "reports";

    if (view === "overview") {
        overviewLink.classList.add("active");
        document.querySelector(".breadcrumb strong").textContent = "Overview";
        document.querySelector(".page-intro .eyebrow").textContent =
            "OPERATIONS / OVERVIEW";
        document.querySelector(".page-intro h1").textContent =
            "Incident overview.";
        document.querySelector(".page-intro p").textContent =
            "Review incoming reports, track ownership and follow incident response.";

        // Restore the report action when returning from Settings.
        // Analysts cannot submit new incidents; Reporters and Administrators can.
        document.getElementById("report-incident-btn").hidden =
            Number(currentUser?.role_id) === 2;
    } else if (view === "incidents") {
        incidentsLink.classList.add("active");
        document.querySelector(".breadcrumb strong").textContent = "Incident queue";
        document.querySelector(".page-intro .eyebrow").textContent =
            "RESPONSE MANAGEMENT / INCIDENTS";
        document.querySelector(".page-intro h1").textContent =
            "Incident queue.";
        document.querySelector(".page-intro p").textContent =
            "Review and manage reported security incidents.";

        loadIncidents().catch(error =>
            console.error("Unable to load incident queue:", error)
        );
    } else if (view === "investigations") {
        investigationsLink.classList.add("active");

        document.querySelector(".breadcrumb strong").textContent =
            "Investigations";

        document.querySelector(".page-intro .eyebrow").textContent =
            "RESPONSE MANAGEMENT / INVESTIGATIONS";

        document.querySelector(".page-intro h1").textContent =
            "Investigation workspace.";

        document.querySelector(".page-intro p").textContent =
            "Review active investigations and document response actions.";

        document.getElementById("report-incident-btn").hidden = true;
        loadInvestigations();
    } else if (view === "analysts") {
    analystsLink.classList.add("active");

    document.querySelector(".breadcrumb strong").textContent =
        "Analysts";

    document.getElementById("report-incident-btn").hidden = true;

    document.querySelector(".page-intro .eyebrow").textContent =
        "OPERATIONS / TEAM DIRECTORY";

    document.querySelector(".page-intro h1").textContent =
        "Analyst directory.";

    document.querySelector(".page-intro p").textContent =
        "Review analyst availability, workload and incident history.";

    loadAnalystDirectory();
    } else if (view === "reports") {
        reportsLink.classList.add("active");

        document.querySelector(".breadcrumb strong").textContent = "Reports";
        document.querySelector(".page-intro .eyebrow").textContent =
            "OPERATIONS / REPORTING";
        document.querySelector(".page-intro h1").textContent =
            "Incident reports.";
        document.querySelector(".page-intro p").textContent =
            "Review incident trends, severity distribution and analyst workload.";

        document.getElementById("report-incident-btn").hidden = true;
        loadReports();
    } else if (view === "settings") {
        document.querySelector(".breadcrumb strong").textContent = "Settings";

        document.querySelector(".page-intro .eyebrow").textContent =
            "ACCOUNT MANAGEMENT / SETTINGS";

        document.querySelector(".page-intro h1").textContent =
            "Account settings.";

        document.querySelector(".page-intro p").textContent =
            "View and manage your IncidentBridge account.";

        // The report action is not part of the Settings page.
        document.getElementById("report-incident-btn").hidden = true;

        loadSettings();
    }
}

overviewLink.addEventListener("click", event => {
    event.preventDefault();
    navigateToView("overview");
});

incidentsLink.addEventListener("click", event => {
    event.preventDefault();
    navigateToView("incidents");
});

investigationsLink.addEventListener("click", event => {
    event.preventDefault();
    navigateToView("investigations");
});

analystsLink.addEventListener("click", event => {
    event.preventDefault();
    navigateToView("analysts");
});

reportsLink.addEventListener("click", event => {
    event.preventDefault();
    navigateToView("reports");
});

initializeReportsControls();

const settingsLink = document.getElementById("nav-settings");

settingsLink.addEventListener("click", event => {
    event.preventDefault();

    document.querySelectorAll(".nav-item").forEach(item => {
        item.classList.remove("active");
    });

    settingsLink.classList.add("active");
    navigateToView("settings");
});

if (viewAllIncidentsLink) {
    viewAllIncidentsLink.addEventListener("click", event => {
        event.preventDefault();

        if (workspaceContent.classList.contains("queue-view")) {
            exportVisibleIncidents();
        } else {
            navigateToView("incidents");
        }
    });
}

document.querySelectorAll(".incident-tab").forEach(tab => {
    tab.addEventListener("click", () => {

        activeIncidentFilter = tab.dataset.statusFilter;

        document.querySelectorAll(".incident-tab").forEach(item => {
            const isActive = item === tab;

            item.classList.toggle("active", isActive);
            item.setAttribute("aria-selected", isActive);
        });

        renderIncidentTable();
    });
});
