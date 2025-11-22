# backend/models.py

from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

# -------------------------
# SITE
# -------------------------
class Site(db.Model):
    __tablename__ = "sites"
    site_id = db.Column(db.Integer, primary_key=True)
    site_name = db.Column(db.String(120), nullable=False)
    status = db.Column(db.String(50), nullable=False, default="WIP")

    orders = db.relationship("Order", backref="site", lazy=True)
    inventory_items = db.relationship("Inventory", backref="site", lazy=True)


# -------------------------
# SUPPLIER
# -------------------------
class Supplier(db.Model):
    __tablename__ = "suppliers"
    supplier_id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120))
    phone = db.Column(db.String(50))

    orders = db.relationship("Order", backref="supplier", lazy=True)


# -------------------------
# MATERIAL
# -------------------------
class Material(db.Model):
    __tablename__ = "materials"
    material_id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    sku = db.Column(db.String(80), nullable=False, unique=True)
    category = db.Column(db.String(80))

    inventory_items = db.relationship("Inventory", backref="material", lazy=True)
    orders = db.relationship("Order", backref="material", lazy=True)


# -------------------------
# INVENTORY
# -------------------------
class Inventory(db.Model):
    __tablename__ = "inventory"
    inventory_id = db.Column(db.Integer, primary_key=True)

    material_id = db.Column(
        db.Integer, db.ForeignKey("materials.material_id"), nullable=False
    )
    site_id = db.Column(
        db.Integer, db.ForeignKey("sites.site_id"), nullable=False
    )

    qty = db.Column(db.Integer, nullable=False, default=0)
    low_threshold = db.Column(db.Integer, nullable=False, default=10)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


# -------------------------
# ORDER  (UPDATED — includes quantity)
# -------------------------
class Order(db.Model):
    __tablename__ = "orders"
    order_id = db.Column(db.Integer, primary_key=True)

    material_id = db.Column(
        db.Integer, db.ForeignKey("materials.material_id"), nullable=False
    )
    supplier_id = db.Column(
        db.Integer, db.ForeignKey("suppliers.supplier_id"), nullable=False
    )
    site_id = db.Column(
        db.Integer, db.ForeignKey("sites.site_id"), nullable=False
    )

    # NEW FIELD — required by your updated app.py
    quantity = db.Column(db.Integer, nullable=False, default=0)

    eta = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(50), nullable=False, default="SCHEDULED")
    delivered_at = db.Column(db.Date)
    delay_reason = db.Column(db.String(255))

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )