# backend/app.py

from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime, date
from config import Config
from models import db, Site, Supplier, Material, Inventory, Order


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    db.init_app(app)
    CORS(app)  # allow your HTML pages to call the API during local dev

    # ---------- Helper ---------- #
    def parse_date(value):
        if not value:
            return None
        return datetime.strptime(value, "%Y-%m-%d").date()

    # ---------- Health ---------- #
    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "timestamp": datetime.utcnow().isoformat()})

    # ---------- CREATE + READ: Sites ---------- #
    @app.route("/api/sites", methods=["GET"])
    def get_sites():
        sites = Site.query.all()
        return jsonify([
            {"site_id": s.site_id, "site_name": s.site_name, "status": s.status}
            for s in sites
        ])

    @app.route("/api/sites", methods=["POST"])
    def create_site():
        """
        Simple endpoint so your 'Add Site' button can create a new site.
        Expected JSON:
        {
            "site_name": "...",
            "status": "WORKING" or "WIP"
        }
        """
        data = request.get_json() or {}
        site_name = data.get("site_name")
        status = data.get("status", "WORKING").upper()

        if not site_name:
            return jsonify({"error": "site_name is required"}), 400

        site = Site(site_name=site_name, status=status)
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

    # ---------- READ: Suppliers, Materials ---------- #
    @app.route("/api/suppliers", methods=["GET"])
    def get_suppliers():
        sups = Supplier.query.all()
        return jsonify([
            {
                "supplier_id": s.supplier_id,
                "name": s.name,
                "email": s.email,
                "phone": s.phone,
            }
            for s in sups
        ])

    @app.route("/api/materials", methods=["GET"])
    def get_materials():
        mats = Material.query.all()
        return jsonify([
            {
                "material_id": m.material_id,
                "name": m.name,
                "sku": m.sku,
                "category": m.category,
            }
            for m in mats
        ])

    # ---------- READ & UPDATE: Inventory (Material Overview / Live Cards) ---------- #
    @app.route("/api/inventory", methods=["GET"])
    def get_inventory():
        """
        This powers your 'material overview'. Frontend can poll this
        to keep the frames/cards live.
        Optional query param: ?site_id=1
        """
        site_id = request.args.get("site_id", type=int)
        query = Inventory.query
        if site_id:
            query = query.filter_by(site_id=site_id)
        items = query.all()

        result = []
        for i in items:
            status = (
                "REORDER"
                if i.qty <= 0
                else "LOW"
                if i.qty <= i.low_threshold
                else "OK"
            )
            result.append(
                {
                    "inventory_id": i.inventory_id,
                    "site_id": i.site_id,
                    "site_name": i.site.site_name,
                    "material_id": i.material_id,
                    "material_name": i.material.name,
                    "qty": i.qty,
                    "low_threshold": i.low_threshold,
                    "status": status,
                }
            )
        return jsonify(result)

    @app.route("/api/inventory/<int:inventory_id>", methods=["PATCH"])
    def update_inventory(inventory_id):
        """
        Use this when you adjust stock (e.g. + / - buttons on manager page).
        """
        item = Inventory.query.get_or_404(inventory_id)
        data = request.get_json() or {}
        if "qty" in data:
            item.qty = int(data["qty"])
        if "low_threshold" in data:
            item.low_threshold = int(data["low_threshold"])
        db.session.commit()
        return jsonify({"message": "Inventory updated"})

    # ---------- CREATE / READ / UPDATE / DELETE: Orders ---------- #
    @app.route("/api/orders", methods=["GET"])
    def get_orders():
        """
        Returns all orders, optionally filtered by status.
        Adds quantity to the JSON so the UI can show how much was ordered.
        """
        status = request.args.get("status")
        query = Order.query
        if status:
            query = query.filter_by(status=status.upper())
        orders = query.all()

        response = []
        for o in orders:
            response.append(
                {
                    "order_id": o.order_id,
                    "material_id": o.material_id,
                    "material_name": o.material.name,
                    "supplier_id": o.supplier_id,
                    "supplier_name": o.supplier.name,
                    "site_id": o.site_id,
                    "site_name": o.site.site_name,
                    "quantity": getattr(o, "quantity", None),  # requires Order.quantity in model
                    "eta": o.eta.isoformat() if o.eta else None,
                    "status": o.status,
                    "delivered_at": o.delivered_at.isoformat() if o.delivered_at else None,
                    "delay_reason": o.delay_reason,
                }
            )
        return jsonify(response)

    @app.route("/api/orders", methods=["POST"])
    def create_order():
        """
        Create a new order.

        Expected JSON:
        {
            "material_id": 1,
            "supplier_id": 1,
            "site_id": 1,
            "eta": "2025-11-30",
            "status": "SCHEDULED",    # optional
            "quantity": 50            # NEW: required for interactive orders
        }
        """
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
            # Make sure Order model has a 'quantity' column
            quantity=int(data["quantity"]),
        )
        db.session.add(order)
        db.session.commit()
        return jsonify({"message": "Order created", "order_id": order.order_id}), 201

    @app.route("/api/orders/<int:order_id>", methods=["PATCH"])
    def update_order(order_id):
        """
        Update order status, ETA, delay_reason or quantity.
        """
        order = Order.query.get_or_404(order_id)
        data = request.get_json() or {}

        if "status" in data:
            order.status = data["status"].upper()
            if order.status == "DELIVERED" and not order.delivered_at:
                order.delivered_at = date.today()
        if "eta" in data:
            order.eta = parse_date(data["eta"])
        if "delay_reason" in data:
            order.delay_reason = data["delay_reason"]
        if "quantity" in data:
            # quantity edit (e.g. supplier sends partial shipment update)
            order.quantity = int(data["quantity"])

        db.session.commit()
        return jsonify({"message": "Order updated"})

    @app.route("/api/orders/<int:order_id>", methods=["DELETE"])
    def delete_order(order_id):
        order = Order.query.get_or_404(order_id)
        db.session.delete(order)
        db.session.commit()
        return jsonify({"message": "Order deleted"})

    # ---------- KPI Endpoint (for Reports) ---------- #
    @app.route("/api/kpi", methods=["GET"])
    def get_kpi():
        total_sites = Site.query.count()
        working = Site.query.filter_by(status="WORKING").count()
        wip = Site.query.filter_by(status="WIP").count()

        inv_items = Inventory.query.all()
        ok = low = reorder = 0
        for i in inv_items:
            if i.qty <= 0:
                reorder += 1
            elif i.qty <= i.low_threshold:
                low += 1
            else:
                ok += 1

        total_orders = Order.query.count()
        status_counts = {
            "SCHEDULED": Order.query.filter_by(status="SCHEDULED").count(),
            "IN_TRANSIT": Order.query.filter_by(status="IN_TRANSIT").count(),
            "DELAYED": Order.query.filter_by(status="DELAYED").count(),
            "DELIVERED": Order.query.filter_by(status="DELIVERED").count(),
        }

        return jsonify(
            {
                "sites": {"total": total_sites, "working": working, "wip": wip},
                "inventory": {"ok": ok, "low": low, "reorder": reorder},
                "orders": {"total": total_orders, "by_status": status_counts},
            }
        )

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(debug=True)