# backend/app.py

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from datetime import datetime, date
from config import Config
from models import db, Site, Supplier, Material, Inventory, Order


def create_app():
    app = Flask(
        __name__,
        static_folder="../",       # serve index.html + assets
        static_url_path=""         # allow /index.html, /app.js etc
    )

    app.config.from_object(Config)
    db.init_app(app)

    # --------------------------------------------------------
    # CORRECT CORS SETTINGS
    # Your frontend runs at *port 5500*, not 5000.
    # --------------------------------------------------------
    CORS(
        app,
        resources={r"/api/*": {"origins": [
            "http://127.0.0.1:5500",
            "http://localhost:5500"
        ]}},
        supports_credentials=True
    )

    # --------------------------------------------------------
    # SERVE FRONT-END FILES
    # --------------------------------------------------------
    @app.route("/")
    def serve_index():
        return send_from_directory("../", "index.html")

    @app.route("/<path:path>")
    def serve_static(path):
        return send_from_directory("../", path)

    # --------------------------------------------------------
    # HELPERS
    # --------------------------------------------------------
    def parse_date(value):
        if not value:
            return None
        return datetime.strptime(value, "%Y-%m-%d").date()

    # --------------------------------------------------------
    # HEALTH CHECK
    # --------------------------------------------------------
    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok", "timestamp": datetime.utcnow().isoformat()})

    # --------------------------------------------------------
    # SITES
    # --------------------------------------------------------
    @app.route("/api/sites", methods=["GET"])
    def get_sites():
        sites = Site.query.all()
        return jsonify([{
            "site_id": s.site_id,
            "site_name": s.site_name,
            "status": s.status
        } for s in sites])

    @app.route("/api/sites", methods=["POST"])
    def create_site():
        data = request.get_json() or {}
        name = data.get("site_name")
        status = data.get("status", "WORKING").upper()

        if not name:
            return jsonify({"error": "site_name is required"}), 400

        site = Site(site_name=name, status=status)
        db.session.add(site)
        db.session.commit()

        return jsonify({
            "message": "Site created",
            "site": {
                "site_id": site.site_id,
                "site_name": site.site_name,
                "status": site.status
            }
        }), 201

    # --------------------------------------------------------
    # SUPPLIERS
    # --------------------------------------------------------
    @app.route("/api/suppliers")
    def get_suppliers():
        suppliers = Supplier.query.all()
        return jsonify([{
            "supplier_id": s.supplier_id,
            "name": s.name,
            "email": s.email,
            "phone": s.phone
        } for s in suppliers])

    # --------------------------------------------------------
    # MATERIALS
    # --------------------------------------------------------
    @app.route("/api/materials")
    def get_materials():
        mats = Material.query.all()
        return jsonify([{
            "material_id": m.material_id,
            "name": m.name,
            "sku": m.sku,
            "category": m.category
        } for m in mats])

    # --------------------------------------------------------
    # INVENTORY (LIVE UPDATES)
    # --------------------------------------------------------
    @app.route("/api/inventory")
    def get_inventory():
        site_id = request.args.get("site_id", type=int)
        query = Inventory.query

        if site_id:
            query = query.filter_by(site_id=site_id)

        items = query.all()

        result = []
        for i in items:
            if i.qty <= 0:
                status = "REORDER"
            elif i.qty <= i.low_threshold:
                status = "LOW"
            else:
                status = "OK"

            result.append({
                "inventory_id": i.inventory_id,
                "site_id": i.site_id,
                "site_name": i.site.site_name,
                "material_id": i.material_id,
                "material_name": i.material.name,
                "qty": i.qty,
                "low_threshold": i.low_threshold,
                "status": status,
            })

        return jsonify(result)

    @app.route("/api/inventory/<int:inventory_id>", methods=["PATCH"])
    def update_inventory(inventory_id):
        item = Inventory.query.get_or_404(inventory_id)
        data = request.get_json() or {}

        if "qty" in data:
            item.qty = int(data["qty"])

        if "low_threshold" in data:
            item.low_threshold = int(data["low_threshold"])

        db.session.commit()
        return jsonify({"message": "Inventory updated"})

    # --------------------------------------------------------
    # ORDERS (CREATE, READ, UPDATE, DELETE)
    # --------------------------------------------------------
    @app.route("/api/orders")
    def get_orders():
        status = request.args.get("status")
        query = Order.query

        if status:
            query = query.filter_by(status=status.upper())

        orders = query.all()

        return jsonify([{
            "order_id": o.order_id,
            "material_id": o.material_id,
            "material_name": o.material.name,
            "supplier_id": o.supplier_id,
            "supplier_name": o.supplier.name,
            "site_id": o.site_id,
            "site_name": o.site.site_name,
            "quantity": o.quantity,
            "eta": o.eta.isoformat() if o.eta else None,
            "status": o.status,
            "delivered_at": o.delivered_at.isoformat() if o.delivered_at else None,
            "delay_reason": o.delay_reason
        } for o in orders])

    @app.route("/api/orders", methods=["POST"])
    def create_order():
        data = request.get_json() or {}

        required = ["material_id", "supplier_id", "site_id", "eta", "quantity"]
        if not all(k in data for k in required):
            return jsonify({"error": "Missing required fields"}), 400

        order = Order(
            material_id=data["material_id"],
            supplier_id=data["supplier_id"],
            site_id=data["site_id"],
            eta=parse_date(data["eta"]),
            status=data.get("status", "SCHEDULED").upper(),
            quantity=int(data["quantity"])
        )

        db.session.add(order)
        db.session.commit()

        return jsonify({"message": "Order created", "order_id": order.order_id}), 201

    @app.route("/api/orders/<int:order_id>", methods=["PATCH"])
    def update_order(order_id):
        order = Order.query.get_or_404(order_id)
        data = request.get_json() or {}

        if "status" in data:
            order.status = data["status"].upper()
            if order.status == "DELIVERED" and not order.delivered_at:
                order.delivered_at = date.today()

        if "eta" in data:
            order.eta = parse_date(data["eta"])

        if "quantity" in data:
            order.quantity = int(data["quantity"])

        if "delay_reason" in data:
            order.delay_reason = data["delay_reason"]

        db.session.commit()
        return jsonify({"message": "Order updated"})

    @app.route("/api/orders/<int:order_id>", methods=["DELETE"])
    def delete_order(order_id):
        order = Order.query.get_or_404(order_id)
        db.session.delete(order)
        db.session.commit()
        return jsonify({"message": "Order deleted"})

    # --------------------------------------------------------
    # KPI METRICS
    # --------------------------------------------------------
    @app.route("/api/kpi")
    def get_kpi():
        total_sites = Site.query.count()
        working = Site.query.filter_by(status="WORKING").count()
        wip = Site.query.filter_by(status="WIP").count()

        inv = Inventory.query.all()
        ok = low = reorder = 0

        for item in inv:
            if item.qty <= 0:
                reorder += 1
            elif item.qty <= item.low_threshold:
                low += 1
            else:
                ok += 1

        orders_total = Order.query.count()

        return jsonify({
            "sites": {"total": total_sites, "working": working, "wip": wip},
            "inventory": {"ok": ok, "low": low, "reorder": reorder},
            "orders": {
                "total": orders_total,
                "by_status": {
                    "SCHEDULED": Order.query.filter_by(status="SCHEDULED").count(),
                    "IN_TRANSIT": Order.query.filter_by(status="IN_TRANSIT").count(),
                    "DELAYED": Order.query.filter_by(status="DELAYED").count(),
                    "DELIVERED": Order.query.filter_by(status="DELIVERED").count(),
                }
            }
        })

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(debug=True)