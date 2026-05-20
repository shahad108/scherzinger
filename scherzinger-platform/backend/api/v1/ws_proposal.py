"""Phase 5 (§5.5) — WebSocket endpoint for proposal collab channel.

``GET /api/v1/ws/proposal/{id}`` accepts a WebSocket upgrade and joins
the in-process ``CollabChannel`` keyed by ``proposal_id``. Incoming
messages are JSON objects:

    {"kind": "cursor", "position": {...}}      → broadcast to peers
    {"kind": "comment", "comment": "...",
     "aid": "X-1"}                              → broadcast + persist

Auth: cookie-authenticated via the same ``pryzm_at`` access cookie as
the REST surface. Anonymous WS handshakes are closed with 4401.

MF2 (Phase-5 review): per-proposal authorisation is enforced at the
handshake. ``proposal_id`` MUST be a UUID that resolves to a row in
``pricing_proposals``; otherwise the handshake closes with 1008 policy
violation. ``aid`` on comment frames must match the proposal's own
``article_id`` — mismatched frames are rejected with an error message
frame (the audit write is suppressed) so a connected user can't
attribute comments to a SKU they never opened a proposal for.
"""
from __future__ import annotations

import json
import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.auth.security import verify_token
from backend.database import SessionLocal
from backend.models import PricingProposal
from backend.services.realtime.collab import channel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["realtime"])


# WebSocket close codes (RFC 6455 + extensions).
_WS_CLOSE_UNAUTHORIZED = 4401  # custom 4xxx — bespoke "not logged in".
_WS_CLOSE_POLICY_VIOLATION = 1008  # standard "policy violation".


@router.websocket("/proposal/{proposal_id}")
async def proposal_collab(websocket: WebSocket, proposal_id: str) -> None:
    """Bidirectional collab channel for a single proposal.

    Cursor + comment broadcasts. Approval state transitions still ride
    the SSE bus (``proposal.*``).
    """
    token = websocket.cookies.get("pryzm_at")
    user_id: str | None = None
    if token:
        try:
            claims = verify_token(token, expected_kind="access")
            user_id = str(claims.get("sub"))
        except Exception:
            user_id = None
    if not user_id:
        await websocket.close(code=_WS_CLOSE_UNAUTHORIZED)
        return

    # MF2: load the proposal and apply the same access rule as the REST
    # ``GET /pricing/proposals/{id}`` (`_get_proposal` — row-must-exist).
    # Anything else (invalid UUID, missing row) closes with 1008.
    try:
        proposal_uuid = UUID(proposal_id)
    except (ValueError, AttributeError, TypeError):
        await websocket.close(code=_WS_CLOSE_POLICY_VIOLATION)
        return

    db_handshake = SessionLocal()
    try:
        proposal = db_handshake.get(PricingProposal, proposal_uuid)
        if proposal is None:
            await websocket.close(code=_WS_CLOSE_POLICY_VIOLATION)
            return
        expected_aid = proposal.article_id
    finally:
        db_handshake.close()

    await websocket.accept()
    send_fn = lambda payload: websocket.send_text(json.dumps(payload))  # noqa: E731
    conn = await channel.connect(
        proposal_id=proposal_id,
        user_id=user_id,
        send=send_fn,
    )
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            kind = msg.get("kind")
            if kind == "cursor":
                position = msg.get("position") or {}
                if isinstance(position, dict):
                    await channel.broadcast_cursor(conn, position)
            elif kind == "comment":
                comment = msg.get("comment")
                aid = msg.get("aid")
                if not (isinstance(comment, str) and comment.strip()):
                    continue
                # MF2: comment frames must target the proposal's own
                # article_id. A null aid is fine (the channel falls back
                # to the proposal_id as target). A mismatched aid is
                # rejected with an error frame so the client can recover.
                if isinstance(aid, str) and aid != expected_aid:
                    await websocket.send_text(
                        json.dumps(
                            {
                                "kind": "error",
                                "code": "aid_mismatch",
                                "message": (
                                    "comment aid does not match the proposal's "
                                    "article_id"
                                ),
                            }
                        )
                    )
                    continue
                db = SessionLocal()
                try:
                    await channel.broadcast_comment(
                        conn,
                        comment,
                        session=db,
                        aid=aid if isinstance(aid, str) else None,
                    )
                finally:
                    db.close()
    except WebSocketDisconnect:
        pass
    finally:
        await channel.disconnect(conn)


__all__ = ["router"]
