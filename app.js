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

// Wrapper for fetch with error handling
async function api(url, method = "GET", body = null) {
    const options = { method, headers: { "Content-Type": "application/json" } };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
}

// =======================================
// GLOBAL LOADING OVERLAY
// =======================================
function showLoading() {
    document.getElementById("loadingOverlay")?.classList.remove("d-none");
}
function hideLoading() {
    document.getElementById("loadingOverlay")?.classList.add("d-none");
}

// =======================================
// PAGE ROUTING
// =======================================
document.addEventListener("DOMContentLoaded", () => {
    if (document.body.classList.contains("dashboard-page")) loadDashboard();
    if (document.body.classList.contains("supplier-page")) loadSupplierOrders();
    if (document.body.classList.contains("manager-page")) loadInventory();
    if (document.body.classList.contains("reports-page")) loadReports();
});

// =======================================
// REUSABLE UI HELPERS
// =======================================
function getStatusBadge(status) {
    const s = status.toUpperCase();
    const colors = {
        OK: "badge-status-ok",
        LOW: "badge-status-low",
        REORDER: "badge-status-critical",
        CRITICAL: "badge-status-critical",
        IN_TRANSIT: "badge-status-transit",
        DELAYED: "badge-status-delay",
        SCHEDULED: "bg-secondary",
        DELIVERED: "bg-success"
    };
    return `<span class="badge ${colors[s] || "bg-secondary"}">${status}</span>`;
}

function showEmptyState(id, show = true) {
    const el = document.getElementById(id);
    if (!el) return;
    show ? el.classList.remove("d-none") : el.classList.add("d-none");
}

// =======================================
// FEATURE: Persistent Custom Sites
// =======================================

// Save site list
function saveSites(sites) {
    localStorage.setItem("dewalt_sites", JSON.stringify(sites));
}

// Load site list
function loadSavedSites() {
    const data = localStorage.getItem("dewalt_sites");
    return data ? JSON.parse(data) : [];
}

// Render site list UI
function renderSites() {
    const siteListEl = document.getElementById("siteList");
    if (!siteListEl) return;

    const sites = loadSavedSites();
    siteListEl.innerHTML = "";

    sites.forEach(site => {
        const li = document.createElement("li");
        li.textContent = `${site.name} – ${site.location}`;
        siteListEl.appendChild(li);
    });
}

// Add new site to LocalStorage
function initSiteForm() {
    const form = document.getElementById("siteForm");
    if (!form) return;

    form.addEventListener("submit", e => {
        e.preventDefault();

        const name = document.getElementById("siteName").value.trim();
        const location = document.getElementById("siteLocation").value.trim();
        if (!name || !location) return;

        const sites = loadSavedSites();
        sites.push({ name, location });
        saveSites(sites);

        renderSites();
        form.reset();
    });

    renderSites();
}

// =======================================
// FEATURE: Create & Delete Orders
// =======================================

// CREATE ORDER
async function createOrder(orderData) {
    showLoading();
    try {
        await api(`${API_BASE}/orders`, "POST", orderData);
        loadSupplierOrders();
        loadInventory();
    } catch (error) {
        console.error(error);
        alert("Failed to create order.");
    } finally {
        hideLoading();
    }
}

// DELETE ORDER
async function deleteOrder(orderId) {
    if (!confirm("Are you sure you want to delete this order?")) return;

    showLoading();
    try {
        await api(`${API_BASE}/orders/${orderId}`, "DELETE");
        loadSupplierOrders();
    } catch (error) {
        console.error(error);
        alert("Failed to delete order.");
    } finally {
        hideLoading();
    }
}

// =======================================
// DASHBOARD PAGE
// =======================================
async function loadDashboard() {
    try {
        showLoading();
        const data = await api(`${API_BASE}/kpi`);

        // KPI updates
        document.getElementById("totalSites").textContent = data.sites.total;
        document.getElementById("workingSites").textContent = data.sites.working;
        document.getElementById("wipSites").textContent = data.sites.wip;

        document.getElementById("inventoryOK").textContent = data.inventory.ok;
        document.getElementById("inventoryLow").textContent = data.inventory.low;
        document.getElementById("inventoryReorder").textContent = data.inventory.reorder;

        document.getElementById("totalOrders").textContent = data.orders.total;
        document.getElementById("scheduledOrders").textContent = data.orders.by_status.SCHEDULED;
        document.getElementById("inTransitOrders").textContent = data.orders.by_status.IN_TRANSIT;
        document.getElementById("deliveredOrders").textContent = data.orders.by_status.DELIVERED;

        // Chart
        new Chart(document.getElementById("orderStatusChart"), {
            type: "bar",
            data: {
                labels: ["Scheduled", "In Transit", "Delayed", "Delivered"],
                datasets: [{
                    label: "Orders",
                    data: [
                        data.orders.by_status.SCHEDULED,
                        data.orders.by_status.IN_TRANSIT,
                        data.orders.by_status.DELAYED,
                        data.orders.by_status.DELIVERED
                    ],
                    backgroundColor: ["#6c757d", "#0d6efd", "#dc3545", "#28a745"]
                }]
            }
        });

        // Init persistent sites
        initSiteForm();

    } catch (e) {
        console.error("Dashboard Error:", e);
    } finally {
        hideLoading();
    }
}

// =======================================
// SUPPLIER PAGE — ORDERS
// =======================================
async function loadSupplierOrders() {
    try {
        showLoading();
        const orders = await api(`${API_BASE}/orders`);

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
                    <td class="text-end">
                        <button class="btn btn-success btn-sm" onclick="updateOrderStatus(${order.order_id}, 'DELIVERED')">Delivered</button>
                        <button class="btn btn-warning btn-sm" onclick="delayOrder(${order.order_id})">Delay</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteOrder(${order.order_id})">Delete</button>
                    </td>
                </tr>
            `;
            table.innerHTML += row;
        });

    } catch (e) {
        console.error("Supplier Orders Error:", e);
    } finally {
        hideLoading();
    }
}

// UPDATE ORDER STATUS
async function updateOrderStatus(id, status) {
    await api(`${API_BASE}/orders/${id}`, "PATCH", { status });
    loadSupplierOrders();
}

// DELAY ORDER (prompt)
async function delayOrder(id) {
    const eta = prompt("New ETA (YYYY-MM-DD):");
    const reason = prompt("Reason for delay:");
    if (!eta || !reason) return;

    await api(`${API_BASE}/orders/${id}`, "PATCH", {
        status: "DELAYED",
        eta,
        delay_reason: reason
    });

    loadSupplierOrders();
}

// =======================================
// MANAGER PAGE
// =======================================
async function loadInventory() {
    try {
        showLoading();
        const items = await api(`${API_BASE}/inventory`);

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
                    <td class="text-end">
                        <button class="btn btn-success btn-sm" onclick="adjustQty(${item.inventory_id}, ${item.qty + 1})">+</button>
                        <button class="btn btn-danger btn-sm" onclick="adjustQty(${item.inventory_id}, ${item.qty - 1})">−</button>
                    </td>
                </tr>
            `;
            table.innerHTML += row;
        });

    } catch (e) {
        console.error("Inventory Error:", e);
    } finally {
        hideLoading();
    }
}

// PATCH inventory qty
async function adjustQty(id, qty) {
    if (qty < 0) return;
    await api(`${API_BASE}/inventory/${id}`, "PATCH", { qty });
    loadInventory();
}

// =======================================
// REPORTS PAGE
// =======================================
async function loadReports() {
    try {
        showLoading();
        const data = await api(`${API_BASE}/kpi`);

        // ORDERS PIE
        new Chart(document.getElementById("ordersPieChart"), {
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
                    backgroundColor: ["#6c757d", "#0d6efd", "#dc3545", "#28a745"]
                }]
            }
        });

        // INVENTORY PIE
        new Chart(document.getElementById("inventoryPieChart"), {
            type: "pie",
            data: {
                labels: ["OK", "Low", "Reorder"],
                datasets: [{
                    data: [
                        data.inventory.ok,
                        data.inventory.low,
                        data.inventory.reorder
                    ],
                    backgroundColor: ["#28a745", "#ffc107", "#dc3545"]
                }]
            }
        });

    } catch (e) {
        console.error("Reports Error:", e);
    } finally {
        hideLoading();
    }
}