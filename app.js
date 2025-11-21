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

        // ---- Chart ----
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
                        backgroundColor: ["#6c757d", "#0d6efd", "#dc3545", "#198754"]
                    }
                ]
            }
        });

    } catch (error) {
        console.error("Dashboard Error:", error);
    } finally {
        hideLoading();
    }
}

// =======================================
// SUPPLIER PAGE
// =======================================
async function loadSupplierOrders() {
    try {
        showLoading();

        const res = await fetch(`${API_BASE}/orders`);
        const orders = await res.json();

        const table = document.getElementById("supplierOrdersTable");
        table.innerHTML = "";

        if (!orders.length) {
            showEmptyState("emptyStateBlock", true);
            return;
        }
        showEmptyState("emptyStateBlock", false);

        orders.forEach(order => {
            const badge = getStatusBadge(order.status);

            const row = `
                <tr>
                    <td>${order.order_id}</td>
                    <td>${order.material_name}</td>
                    <td>${order.site_name}</td>
                    <td>${order.eta}</td>
                    <td>${badge}</td>
                    <td>
                        <button class="btn btn-success btn-sm" onclick="markDelivered(${order.order_id})">Delivered</button>
                        <button class="btn btn-warning btn-sm" onclick="delayOrder(${order.order_id})">Delay</button>
                    </td>
                </tr>
            `;
            table.innerHTML += row;
        });

    } catch (error) {
        console.error("Supplier Orders Error:", error);
    } finally {
        hideLoading();
    }
}

// ---- Supplier Actions ----
async function markDelivered(orderId) {
    showLoading();
    await fetch(`${API_BASE}/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DELIVERED" })
    });
    hideLoading();
    loadSupplierOrders();
}

async function delayOrder(orderId) {
    const newEta = prompt("Enter new ETA (YYYY-MM-DD):");
    const reason = prompt("Enter delay reason:");

    showLoading();
    await fetch(`${API_BASE}/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            status: "DELAYED",
            eta: newEta,
            delay_reason: reason
        })
    });
    hideLoading();
    loadSupplierOrders();
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
        // NEW: WATER & ELECTRICITY USAGE ACROSS BUILD PHASES
        // ----------------------------------------------------
        const utilityPhases = [
            "Excavation",
            "Concrete",
            "Brickwork",
            "Roofing",
            "Plaster",
            "Finishes"
        ];

        const waterUsage = [800, 2500, 1800, 950, 600, 450];  // litres
        const electricityUsage = [120, 340, 220, 150, 180, 260]; // kWh

        const ctx3 = document.getElementById("utilityUsageChart").getContext("2d");
        new Chart(ctx3, {
            type: "bar",
            data: {
                labels: utilityPhases,
                datasets: [
                    {
                        label: "Water Usage (Litres)",
                        data: waterUsage,
                        backgroundColor: "rgba(54, 162, 235, 0.6)", // blue
                        borderColor: "rgba(54, 162, 235, 1)",
                        borderWidth: 1
                    },
                    {
                        label: "Electricity Usage (kWh)",
                        data: electricityUsage,
                        backgroundColor: "rgba(255, 206, 86, 0.6)", // yellow
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

        // -------------------------------------------------------
        // NEW: HOUSE BUILD PROGRESS (8 HOUSES)
        // -------------------------------------------------------
        const houseLabels = [
            "House 1", "House 2", "House 3", "House 4",
            "House 5", "House 6", "House 7", "House 8"
        ];

        // Dummy realistic progress percentages
        const progress = [82, 67, 40, 55, 90, 73, 28, 61];

        const ctx4 = document.getElementById("houseProgressChart").getContext("2d");
        new Chart(ctx4, {
            type: "bar",
            data: {
                labels: houseLabels,
                datasets: [{
                    label: "Completion (%)",
                    data: progress,
                    backgroundColor: progress.map(value => {
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

    } catch (error) {
        console.error("Reports Error:", error);
    } finally {
        hideLoading();
    }
}