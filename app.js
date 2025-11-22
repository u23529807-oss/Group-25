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
// PAGE ROUTING (FIXED – ADDS MISSING INITIALIZERS)
// =======================================
document.addEventListener("DOMContentLoaded", () => {

    if (document.body.classList.contains("dashboard-page")) {
        loadDashboard();
        initSiteForm();        // REQUIRED
        renderSites();         // REQUIRED
    }

    if (document.body.classList.contains("supplier-page")) {
        loadSupplierOrders();
        initOrderForm();       // REQUIRED for dropdowns to show
    }

    if (document.body.classList.contains("manager-page")) {
        loadInventory();
        loadMaterialOverview(); // REQUIRED for live overview
        setInterval(loadInventory, 5000);        // auto-refresh
        setInterval(loadMaterialOverview, 5000); // auto-refresh
    }

    if (document.body.classList.contains("reports-page")) {
        loadReports();
        initOrderForm(); // REQUIRED so "create order" works
    }
});

// =======================================
// REUSABLE UI HELPERS
// =======================================
function getStatusBadge(status) {
    const s = status?.toUpperCase() || "";
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
// FEATURE: Sites (NOW BACKED BY API)
// =======================================

// Render sites from API into the Captured Sites list
async function renderSites() {
    const siteListEl = document.getElementById("siteList");
    if (!siteListEl) return;

    try {
        const sites = await api(`${API_BASE}/sites`);
        siteListEl.innerHTML = "";

        if (!sites.length) {
            siteListEl.innerHTML = `<li class="text-muted">No sites captured yet.</li>`;
            return;
        }

        sites.forEach(s => {
            const li = document.createElement("li");
            li.textContent = `${s.site_name} – ${s.status}`;
            siteListEl.appendChild(li);
        });
    } catch (err) {
        console.error("Error loading sites:", err);
        siteListEl.innerHTML = `<li class="text-danger">Failed to load sites.</li>`;
    }
}

// Add new site via API
function initSiteForm() {
    const form = document.getElementById("siteForm");
    if (!form) return;

    const nameInput = document.getElementById("siteName");
    const statusSelect = document.getElementById("siteStatus");

    form.addEventListener("submit", async e => {
        e.preventDefault();

        const site_name = nameInput.value.trim();
        const status = statusSelect.value;

        if (!site_name) {
            alert("Please enter a site name.");
            return;
        }

        try {
            showLoading();
            await api(`${API_BASE}/sites`, "POST", { site_name, status });
            await renderSites(); // reload list after successful creation
            form.reset();
        } catch (err) {
            console.error("Create site error:", err);
            alert("Failed to add site.");
        } finally {
            hideLoading();
        }
    });

    // initial render
    renderSites();
}

// =======================================
// FEATURE: Create & Delete Orders
// =======================================

// CREATE ORDER (now with quantity)
async function createOrder(orderData) {
    showLoading();
    try {
        await api(`${API_BASE}/orders`, "POST", orderData);
        // Refresh related views
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

        // Init Add Site form (now API-based)
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
        if (!table) return;
        table.innerHTML = "";

        if (!orders.length) {
            showEmptyState("emptyStateBlock", true);
            return;
        }
        showEmptyState("emptyStateBlock", false);

        orders.forEach(order => {
            const badge = getStatusBadge(order.status);
            const qty = order.quantity ?? "-";

            const row = `
                <tr>
                    <td>${order.order_id}</td>
                    <td>${order.material_name}</td>
                    <td>${order.site_name}</td>
                    <td>${qty}</td>
                    <td>${order.eta || "-"}</td>
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
    try {
        await api(`${API_BASE}/orders/${id}`, "PATCH", { status });
        loadSupplierOrders();
    } catch (err) {
        console.error("Update order status error:", err);
        alert("Failed to update order status.");
    }
}

// DELAY ORDER (prompt)
async function delayOrder(id) {
    const eta = prompt("New ETA (YYYY-MM-DD):");
    const reason = prompt("Reason for delay:");
    if (!eta || !reason) return;

    try {
        await api(`${API_BASE}/orders/${id}`, "PATCH", {
            status: "DELAYED",
            eta,
            delay_reason: reason
        });
        loadSupplierOrders();
    } catch (err) {
        console.error("Delay order error:", err);
        alert("Failed to delay order.");
    }
}

// =======================================
// INITIALIZE CREATE ORDER FORM (Reports page)
// =======================================
async function initOrderForm() {
    const form = document.getElementById("newOrderForm");
    if (!form) return;

    const siteSelect = document.getElementById("orderSite");
    const matSelect  = document.getElementById("orderMaterial");
    const supSelect  = document.getElementById("orderSupplier");
    const etaInput   = document.getElementById("orderEta");
    const qtyInput   = document.getElementById("orderQty"); // NEW: quantity input

    try {
        const [sites, materials, suppliers] = await Promise.all([
            api(`${API_BASE}/sites`),
            api(`${API_BASE}/materials`),
            api(`${API_BASE}/suppliers`)
        ]);

        siteSelect.innerHTML = sites
            .map(s => `<option value="${s.site_id}">${s.site_name}</option>`)
            .join("");

        matSelect.innerHTML = materials
            .map(m => `<option value="${m.material_id}">${m.name}</option>`)
            .join("");

        supSelect.innerHTML = suppliers
            .map(s => `<option value="${s.supplier_id}">${s.name}</option>`)
            .join("");

    } catch (err) {
        console.error("Dropdown load error:", err);
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const quantity = parseInt(qtyInput?.value || "0", 10);

        if (!quantity || quantity <= 0) {
            alert("Please enter a valid quantity.");
            return;
        }

        const orderData = {
            site_id: parseInt(siteSelect.value),
            material_id: parseInt(matSelect.value),
            supplier_id: parseInt(supSelect.value),
            eta: etaInput.value,
            status: "SCHEDULED",
            quantity: quantity
        };

        await createOrder(orderData);
        form.reset();
    });
}

// =======================================
// MANAGER PAGE — INVENTORY OVERVIEW
// =======================================
async function loadInventory() {
    try {
        showLoading();
        const items = await api(`${API_BASE}/inventory`);

        const table = document.getElementById("inventoryTable");
        if (!table) return;
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
    try {
        await api(`${API_BASE}/inventory/${id}`, "PATCH", { qty });
        loadInventory();
    } catch (err) {
        console.error("Adjust qty error:", err);
        alert("Failed to update inventory.");
    }
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
        // Initialise order creation form (with quantity)
        initOrderForm();
        hideLoading();
    }
}