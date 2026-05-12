"""Seed roles + three demo users (Frank/Till/Heiko).

Idempotent: safe to re-run. Uses bcrypt via passlib.

Usage:
    python -m scripts.seed_auth                   # default passwords
    python -m scripts.seed_auth --reset-passwords # rehash from defaults
"""
from __future__ import annotations

import argparse
from uuid import UUID

from passlib.context import CryptContext
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models import Role, User, UserRole

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Permission matrix from MIGRATION_PLAN §4.2.1.
ROLES: dict[str, dict] = {
    "analyst": {
        "label": "Pricing Analyst",
        "permissions": [
            "view.margin_cockpit",
            "view.quotes",
            "view.forecast",
            "view.studio",
            "view.ai_briefing",
            "view.action_center",
            "act.accept_recommendation",
            "act.start_ab_test",
            "act.export_branded_pdf",
            "act.share_decision",
            "view.audit_trail",
            "act.edit_guardrails:propose",
        ],
    },
    "md": {
        "label": "Managing Director",
        "permissions": [
            "view.margin_cockpit",
            "view.quotes",
            "view.forecast",
            "view.studio:read",
            "view.ai_briefing",
            "view.action_center",
            "act.accept_recommendation",
            "act.approve_md_authority",
            "act.edit_guardrails",
            "act.export_branded_pdf",
            "view.audit_trail",
        ],
    },
    "sales": {
        "label": "Sales / KAM",
        "permissions": [
            "view.margin_cockpit:own",
            "view.quotes:own",
            "view.forecast:own",
            "view.action_center:own",
            "act.export_branded_pdf:own",
            "view.audit_trail:own",
        ],
    },
    "admin": {
        "label": "Admin",
        "permissions": [
            "view.margin_cockpit",
            "view.quotes",
            "view.forecast",
            "view.studio",
            "view.ai_briefing",
            "view.action_center",
            "act.accept_recommendation",
            "act.start_ab_test",
            "act.approve_md_authority",
            "act.edit_guardrails",
            "act.export_branded_pdf",
            "act.share_decision",
            "view.audit_trail",
            "admin.users",
        ],
    },
}

# Demo users. Passwords are intentionally simple and rotated per env.
USERS: list[dict] = [
    {
        "id": UUID("00000000-0000-0000-0000-000000000001"),
        "email": "frank@scherzinger.de",
        "name": "Frank Keller",
        "dept": "Pricing & Controlling",
        "ui_persona_default": "frank",
        "password": "frank-demo-2026",
        "roles": ["analyst"],
    },
    {
        "id": UUID("00000000-0000-0000-0000-000000000002"),
        "email": "till@scherzinger.de",
        "name": "Till Hoffmann",
        "dept": "Management",
        "ui_persona_default": "till",
        "password": "till-demo-2026",
        "roles": ["md"],
    },
    {
        "id": UUID("00000000-0000-0000-0000-000000000003"),
        "email": "heiko@scherzinger.de",
        "name": "Heiko Müller",
        "dept": "Sales",
        "ui_persona_default": "heiko",
        "password": "heiko-demo-2026",
        "roles": ["sales"],
    },
]


def upsert_roles(db: Session) -> None:
    for role_id, spec in ROLES.items():
        existing = db.get(Role, role_id)
        if existing is None:
            db.add(Role(id=role_id, label=spec["label"], permissions=spec["permissions"]))
        else:
            existing.label = spec["label"]
            existing.permissions = spec["permissions"]
    db.flush()


def upsert_users(db: Session, *, reset_passwords: bool) -> None:
    for spec in USERS:
        existing = db.get(User, spec["id"])
        password_hash = pwd.hash(spec["password"])
        if existing is None:
            db.add(
                User(
                    id=spec["id"],
                    email=spec["email"],
                    name=spec["name"],
                    dept=spec["dept"],
                    ui_persona_default=spec["ui_persona_default"],
                    password_hash=password_hash,
                )
            )
        else:
            existing.email = spec["email"]
            existing.name = spec["name"]
            existing.dept = spec["dept"]
            existing.ui_persona_default = spec["ui_persona_default"]
            if reset_passwords:
                existing.password_hash = password_hash
        db.flush()
        # Sync user_roles: drop missing, add new.
        existing_roles = {ur.role_id for ur in db.query(UserRole).filter_by(user_id=spec["id"]).all()}
        wanted_roles = set(spec["roles"])
        for role_id in existing_roles - wanted_roles:
            db.query(UserRole).filter_by(user_id=spec["id"], role_id=role_id).delete()
        for role_id in wanted_roles - existing_roles:
            db.add(UserRole(user_id=spec["id"], role_id=role_id))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset-passwords", action="store_true")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        upsert_roles(db)
        upsert_users(db, reset_passwords=args.reset_passwords)
        db.commit()
        print(f"Seeded {len(ROLES)} roles and {len(USERS)} users.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
