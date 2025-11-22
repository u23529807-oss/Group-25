# backend/db_init_.py

from app import create_app
from models import db, Supplier, Material, Site

def seed_data():
    # ----- SUPPLIERS -----
    suppliers = [
        Supplier(name="Build It Pretoria North", email="orders@buildit.co.za", phone="+27 12 555 0000"),
        Supplier(name="CashBuild Rosslyn", email="sales@cashbuild.co.za", phone="+27 12 564 1123"),
        Supplier(name="PPC Bulk Cement Supply", email="bulk@ppc.co.za", phone="+27 11 377 4400"),
    ]

    # ----- MATERIALS -----
    materials = [
        Material(name="Bricks (Pallet)", sku="BRK-001", category="Building Materials"),
        Material(name="Cement 50kg", sku="CEM-002", category="Building Materials"),
        Material(name="River Sand 1t", sku="SND-003", category="Aggregates"),
        Material(name="Doorframe", sku="DRF-004", category="Hardware"),
        Material(name="Window Aluminium", sku="WND-005", category="Hardware"),
        Material(name="TMT Steel Bar", sku="STEEL-006", category="Structural"),
    ]

    # ----- SITES -----
    sites = [
        Site(site_name="Klerksoord", status="WIP"),
        Site(site_name="Amandasig", status="WORKING"),
    ]

    db.session.add_all(suppliers + materials + sites)
    db.session.commit()
    print("Demo data inserted successfully!")


if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        db.drop_all()
        db.create_all()
        seed_data()