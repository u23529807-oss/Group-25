// app.js — BFB Supply Portal
// Features:
// - Seed + persistence (localStorage)
// - Dashboard KPIs & order cards
// - Supplier page: search, sortable columns, Mark Delivered, Update ETA, Report Delay (modal)
// - Manager page: inventory cards (+/- qty if you use manager.html with controls)
// - Reports: Chart.js with dark theme defaults and robust loading guard
// - Utilities on Dashboard: Reset / Export / Import

// =======================================
// CONFIG
// =======================================
const API_BASE = "http://127.0.0.1:5000/api";

// Global Loading Overlay
function showLoading() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) overlay.classList.remove("d-none");
}

function hideLoading() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) overlay.classList.add("d-none");
}

// =======================================
// PAGE ROUTING DETECTION
// =======================================
document.addEventListener("DOMContentLoaded", () => {
    if (document.body.classList.contains("dashboard-page")) loadDashboard();
    if (document.body.classList.contains("supplier-page")) loadSupplierOrders();
    if (document.body.classList.contains("manager-page")) loadInventory();
    if (document.body.classList.contains("reports-page")) loadReports();
});

// =======================================
// HELPER FUNCTIONS
// =======================================
function getStatusBadge(status) {
    const s = status.toUpperCase();
    if (s === "OK") return `<span class="badge badge-status-ok">OK</span>`;
    if (s === "LOW") return `<span class="badge badge-status-low">Low</span>`;
    if (s === "REORDER" || s === "CRITICAL") return `<span class="badge badge-status-critical">Critical</span>`;
    if (s === "IN_TRANSIT") return `<span class="badge badge-status-transit">In Transit</span>`;
    if (s === "DELAYED") return `<span class="badge badge-status-delay">Delayed</span>`;
    if (s === "SCHEDULED") return `<span class="badge bg-secondary">Scheduled</span>`;
    if (s === "DELIVERED") return `<span class="badge bg-success">Delivered</span>`;
    return `<span class="badge bg-secondary">${status}</span>`;
}

function showEmptyState(containerId, show = true) {
    const emptyBlock = document.getElementById(containerId);
    if (!emptyBlock) return;
    if (show) emptyBlock.classList.remove("d-none");
    else emptyBlock.classList.add("d-none");
}

// =======================================
// DASHBOARD PAGE
// =======================================
async function loadDashboard() {
    try {
        showLoading();

        const res = await fetch(`${API_BASE}/kpi`);
        const data = await res.json();

        // ---- SITE KPI CARDS ----
        document.getElementById("totalSites").textContent = data.sites.total;
        document.getElementById("workingSites").textContent = data.sites.working;
        document.getElementById("wipSites").textContent = data.sites.wip;

        // ---- INVENTORY KPIs ----
        document.getElementById("inventoryOK").textContent = data.inventory.ok;
        document.getElementById("inventoryLow").textContent = data.inventory.low;
        document.getElementById("inventoryReorder").textContent = data.inventory.reorder;

        // ---- ORDERS KPIs ----
        document.getElementById("totalOrders").textContent = data.orders.total;
        document.getElementById("scheduledOrders").textContent = data.orders.by_status.SCHEDULED;
        document.getElementById("inTransitOrders").textContent = data.orders.by_status.IN_TRANSIT;
        document.getElementById("deliveredOrders").textContent = data.orders.by_status.DELIVERED;

        // ---- Order Status Chart ----
        const ctx = document.getElementById("orderStatusChart").getContext("2d");
        new Chart(ctx, {
            type: "bar",
            data: {
                labels: ["Scheduled", "In Transit", "Delayed", "Delivered"],
                datasets: [
                    {
                        label: "Orders",
                        data: [
                            data.orders.by_status.SCHEDULED,
                            data.orders.by_status.IN_TRANSIT,
                            data.orders.by_status.DELAYED,
                            data.orders.by_status.DELIVERED
                        ],
                        backgroundColor: ["#6c757d", "#0d6efd", "#dc3545", "#28a745"]
                    }
                ]
            }
        });

        // ---- Custom Sites (Name + Location, front-end only) ----
        const siteForm = document.getElementById("siteForm");
        const siteListEl = document.getElementById("siteList");

        if (siteForm && siteListEl) {
            const customSites = [];

            const renderSites = () => {
                siteListEl.innerHTML = "";
                customSites.forEach((site) => {
                    const li = document.createElement("li");
                    li.textContent = `${site.name} – ${site.location}`;
                    siteListEl.appendChild(li);
                });
            };

            siteForm.addEventListener("submit", (e) => {
                e.preventDefault();
                const nameInput = document.getElementById("siteName");
                const locationInput = document.getElementById("siteLocation");

                const name = nameInput.value.trim();
                const location = locationInput.value.trim();

                if (!name || !location) return;

                customSites.push({ name, location });
                renderSites();
                siteForm.reset();
            });
        }

    } catch (error) {
        console.error("Dashboard Error:", error);
    } finally {
        hideLoading();
    }
}

// =======================================
// MANAGER PAGE — INVENTORY
// =======================================
async function loadInventory() {
    try {
        showLoading();

        const res = await fetch(`${API_BASE}/inventory`);
        const items = await res.json();

        const table = document.getElementById("inventoryTable");
        table.innerHTML = "";

        if (!items.length) {
            showEmptyState("emptyStateBlock", true);
            return;
        }
        showEmptyState("emptyStateBlock", false);

        items.forEach(item => {
            const badge = getStatusBadge(item.status);

            const row = `
                <tr>
                    <td>${item.material_name}</td>
                    <td>${item.site_name}</td>
                    <td>${item.qty}</td>
                    <td>${badge}</td>
                    <td>
                        <button class="btn btn-success btn-sm" onclick="adjustQty(${item.inventory_id}, ${item.qty + 1})">+</button>
                        <button class="btn btn-danger btn-sm" onclick="adjustQty(${item.inventory_id}, ${item.qty - 1})">-</button>
                    </td>
                </tr>
            `;
            table.innerHTML += row;
        });

    } catch (error) {
        console.error("Inventory Error:", error);
    } finally {
        hideLoading();
    }
}

async function adjustQty(inventoryId, newQty) {
    showLoading();
    await fetch(`${API_BASE}/inventory/${inventoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qty: newQty })
    });
    hideLoading();
    loadInventory();
}

// =======================================
// REPORTS PAGE (reports.html)
// =======================================
async function loadReports() {
    try {
        showLoading();

        const res = await fetch(`${API_BASE}/kpi`);
        const data = await res.json();

        // ------------------------------
        // ORDERS STATUS PIE CHART
        // ------------------------------
        const ctx1 = document.getElementById("ordersPieChart").getContext("2d");
        new Chart(ctx1, {
            type: "pie",
            data: {
                labels: ["Scheduled", "In Transit", "Delayed", "Delivered"],
                datasets: [{
                    data: [
                        data.orders.by_status.SCHEDULED,
                        data.orders.by_status.IN_TRANSIT,
                        data.orders.by_status.DELAYED,
                        data.orders.by_status.DELIVERED
                    ],
                    backgroundColor: [
                        "#6c757d", // Scheduled
                        "#0d6efd", // In Transit
                        "#dc3545", // Delayed
                        "#28a745"  // Delivered
                    ]
                }]
            }
        });

        // ------------------------------
        // INVENTORY HEALTH PIE CHART
        // ------------------------------
        const ctx2 = document.getElementById("inventoryPieChart").getContext("2d");
        new Chart(ctx2, {
            type: "pie",
            data: {
                labels: ["OK", "Low", "Reorder"],
                datasets: [{
                    data: [
                        data.inventory.ok,
                        data.inventory.low,
                        data.inventory.reorder
                    ],
                    backgroundColor: [
                        "#28a745", // OK
                        "#ffc107", // Low
                        "#dc3545"  // Reorder
                    ]
                }]
            }
        });

        // ----------------------------------------------------
        // WATER & ELECTRICITY USAGE ACROSS BUILD PHASES
        // (Interactive sliders adjust these in real time)
        // ----------------------------------------------------
        const utilityPhases = [
            "Excavation",
            "Concrete",
            "Brickwork",
            "Roofing",
            "Plaster",
            "Finishes"
        ];

        const baseWaterUsage = [800, 2500, 1800, 950, 600, 450];       // litres
        const baseElectricityUsage = [120, 340, 220, 150, 180, 260];   // kWh

        const ctx3 = document.getElementById("utilityUsageChart").getContext("2d");
        const utilityChart = new Chart(ctx3, {
            type: "bar",
            data: {
                labels: utilityPhases,
                datasets: [
                    {
                        label: "Water Usage (Litres)",
                        data: [...baseWaterUsage],
                        backgroundColor: "rgba(54, 162, 235, 0.6)",
                        borderColor: "rgba(54, 162, 235, 1)",
                        borderWidth: 1
                    },
                    {
                        label: "Electricity Usage (kWh)",
                        data: [...baseElectricityUsage],
                        backgroundColor: "rgba(255, 206, 86, 0.6)",
                        borderColor: "rgba(255, 206, 86, 1)",
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: "#e5e7eb" }
                    },
                    x: {
                        ticks: { color: "#e5e7eb" }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: "#e5e7eb",
                            font: { size: 11 }
                        }
                    }
                }
            }
        });

        // ---- Interactive Sliders for Water & Electricity ----
        const waterSlider = document.getElementById("waterScale");
        const waterLabel = document.getElementById("waterScaleLabel");
        const electricSlider = document.getElementById("electricScale");
        const electricLabel = document.getElementById("electricScaleLabel");

        if (waterSlider && waterLabel) {
            waterSlider.addEventListener("input", () => {
                const factor = parseInt(waterSlider.value, 10) / 100;
                utilityChart.data.datasets[0].data = baseWaterUsage.map(v => v * factor);
                waterLabel.textContent = `${waterSlider.value}%`;
                utilityChart.update();
            });
        }

        if (electricSlider && electricLabel) {
            electricSlider.addEventListener("input", () => {
                const factor = parseInt(electricSlider.value, 10) / 100;
                utilityChart.data.datasets[1].data = baseElectricityUsage.map(v => v * factor);
                electricLabel.textContent = `${electricSlider.value}%`;
                utilityChart.update();
            });
        }

        // -------------------------------------------------------
        // HOUSE BUILD PROGRESS (8 HOUSES) + "START NEW HOUSE"
        // -------------------------------------------------------
        let houseLabels = [
            "House 1", "House 2", "House 3", "House 4",
            "House 5", "House 6", "House 7", "House 8"
        ];

        let houseProgress = [82, 67, 40, 55, 90, 73, 28, 61];
        let houseStartDates = [
            "2025-01-15",
            "2025-02-03",
            "2025-02-20",
            "2025-03-05",
            "2025-03-18",
            "2025-04-02",
            "2025-04-15",
            "2025-05-01"
        ];

        const ctx4 = document.getElementById("houseProgressChart").getContext("2d");
        const houseChart = new Chart(ctx4, {
            type: "bar",
            data: {
                labels: houseLabels,
                datasets: [{
                    label: "Completion (%)",
                    data: houseProgress,
                    backgroundColor: houseProgress.map(value => {
                        if (value >= 80) return "rgba(40, 167, 69, 0.7)";   // green
                        if (value >= 60) return "rgba(0, 123, 255, 0.7)";   // blue
                        if (value >= 40) return "rgba(255, 193, 7, 0.7)";   // yellow
                        return "rgba(220, 53, 69, 0.7)";                    // red
                    }),
                    borderColor: "rgba(255,255,255,0.4)",
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { color: "#e5e7eb" }
                    },
                    x: {
                        ticks: { color: "#e5e7eb" }
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: "#e5e7eb" }
                    },
                    tooltip: {
                        callbacks: {
                            label: ctx => `${ctx.raw}% complete`
                        }
                    }
                }
            }
        });

        // ---- List & New House Form (Interactive Button) ----
        const housesListEl = document.getElementById("housesList");
        const houseForm = document.getElementById("newHouseForm");
        const houseNameInput = document.getElementById("houseName");
        const houseStartInput = document.getElementById("houseStartDate");

        const renderHousesList = () => {
            if (!housesListEl) return;
            housesListEl.innerHTML = "";
            houseLabels.forEach((label, idx) => {
                const li = document.createElement("li");
                const date = houseStartDates[idx] || "Unknown start date";
                const prog = houseProgress[idx] ?? 0;
                li.textContent = `${label} – started ${date} – ${prog}% complete`;
                housesListEl.appendChild(li);
            });
        };

        renderHousesList();

        if (houseForm && houseNameInput && houseStartInput) {
            houseForm.addEventListener("submit", (e) => {
                e.preventDefault();
                const name = houseNameInput.value.trim();
                const startDate = houseStartInput.value;

                if (!name || !startDate) return;

                // Add new house with 0% progress
                houseLabels.push(name);
                houseProgress.push(0);
                houseStartDates.push(startDate);

                // Update chart
                houseChart.data.labels = houseLabels;
                houseChart.data.datasets[0].data = houseProgress;
                houseChart.data.datasets[0].backgroundColor = houseProgress.map(value => {
                    if (value >= 80) return "rgba(40, 167, 69, 0.7)";
                    if (value >= 60) return "rgba(0, 123, 255, 0.7)";
                    if (value >= 40) return "rgba(255, 193, 7, 0.7)";
                    return "rgba(220, 53, 69, 0.7)";
                });
                houseChart.update();

                // Update list
                renderHousesList();

                // Clear form
                houseForm.reset();
            });
        }

    } catch (error) {
        console.error("Reports Error:", error);
    } finally {
        hideLoading();
    }
}