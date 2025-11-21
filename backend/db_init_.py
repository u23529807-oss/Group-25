# backend/db_init.py

from datetime import date, timedelta
from app import create_app
from models import db, Site, Supplier, Material, Inventory, Order

app = create_app()

with app.app_context():
    db.drop_all()
    db.create_all()

    # Sites
    site1 = Site(site_name="CBD Office Tower", status="WORKING")
    site2 = Site(site_name="North Bridge Project", status="WIP")
    db.session.add_all([site1, site2])

    # Suppliers
    sup1 = Supplier(name="BuildSmart Cement", email="orders@buildsmart.co.za", phone="+27 12 111 1111")
    sup2 = Supplier(name="Sand & More", email="info@sandmore.co.za", phone="+27 12 222 2222")
    db.session.add_all([sup1, sup2])

    # Materials
    mat1 = Material(name="Cement 50kg", sku="CEM50", category="Concrete")
    mat2 = Material(name="River Sand", sku="SAND-RIV", category="Aggregate")
    mat3 = Material(name="Rebar 12mm", sku="REBAR12", category="Steel")
    db.session.add_all([mat1, mat2, mat3])

    db.session.flush()  # to get IDs

    # Inventory
    inv1 = Inventory(material_id=mat1.material_id, site_id=site1.site_id, qty=120, low_threshold=50)
    inv2 = Inventory(material_id=mat2.material_id, site_id=site1.site_id, qty=40, low_threshold=30)
    inv3 = Inventory(material_id=mat3.material_id, site_id=site2.site_id, qty=15, low_threshold=20)
    db.session.add_all([inv1, inv2, inv3])

    # Orders
    o1 = Order(
        material_id=mat2.material_id,
        supplier_id=sup2.supplier_id,
        site_id=site1.site_id,
        eta=date.today() + timedelta(days=3),
        status="IN_TRANSIT"
    )
    o2 = Order(
        material_id=mat1.material_id,
        supplier_id=sup1.supplier_id,
        site_id=site2.site_id,
        eta=date.today() + timedelta(days=7),
        status="SCHEDULED"
    )
    db.session.add_all([o1, o2])

    db.session.commit()
    print("Database initialised with demo data.")