"""Minimal in-process WebSocket collab channel for proposals.

Per Pricing Studio v3 plan §5.5: the WebSocket channel
``collab.proposal.{id}`` carries cursor presence + comment events when
more than one user is viewing the same proposal.

Approval state transitions ride the SSE bus (``proposal.*``). The WS
exists only for the cursor/comment side-channel where the SSE
many-to-one fan-out shape would be the wrong fit.

Surface is intentionally narrow:

  - ``CollabChannel.connect(proposal_id, user_id, send) -> channel``
        Registers a connection; ``send`` is the async callback that
        delivers a JSON-serialisable message to that user.

  - ``CollabChannel.disconnect(channel)``
        Removes a registered connection.

  - ``CollabChannel.broadcast_cursor(channel, position)``
        Broadcasts a cursor presence event to every OTHER connection on
        the same proposal.

  - ``CollabChannel.broadcast_comment(channel, comment, *, session)``
        Broadcasts a comment AND persists it via ``record_audit``
        (action=``proposal_commented``) — the comment is durable.

A single global ``channel`` instance is used by the FastAPI WS
endpoint. Tests can construct their own ``CollabChannel`` for
isolation.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Optional
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from backend.models.pricing.audit import PricingAuditAction, PricingAuditTargetKind
from backend.services.pricing.audit import record_audit

logger = logging.getLogger(__name__)

SendFn = Callable[[dict[str, Any]], Awaitable[None]]


@dataclass
class Connection:
    id: UUID = field(default_factory=uuid4)
    proposal_id: str = ""
    user_id: str = ""
    send: Optional[SendFn] = None


class CollabChannel:
    """In-process registry of connected users per proposal_id."""

    def __init__(self) -> None:
        self._by_proposal: dict[str, list[Connection]] = {}
        self._lock = asyncio.Lock()

    async def connect(
        self,
        *,
        proposal_id: str,
        user_id: str,
        send: SendFn,
    ) -> Connection:
        conn = Connection(proposal_id=proposal_id, user_id=user_id, send=send)
        async with self._lock:
            self._by_proposal.setdefault(proposal_id, []).append(conn)
        return conn

    async def disconnect(self, conn: Connection) -> None:
        async with self._lock:
            bucket = self._by_proposal.get(conn.proposal_id) or []
            self._by_proposal[conn.proposal_id] = [c for c in bucket if c.id != conn.id]
            if not self._by_proposal[conn.proposal_id]:
                self._by_proposal.pop(conn.proposal_id, None)

    async def peers(self, conn: Connection) -> list[Connection]:
        async with self._lock:
            return [
                c for c in self._by_proposal.get(conn.proposal_id, []) if c.id != conn.id
            ]

    async def _broadcast(self, conn: Connection, message: dict[str, Any]) -> int:
        peers = await self.peers(conn)
        delivered = 0
        for peer in peers:
            try:
                if peer.send is not None:
                    await peer.send(message)
                    delivered += 1
            except Exception:
                # Drop the peer on send failure so future broadcasts
                # don't keep raising. The peer will reconnect.
                logger.exception("collab.broadcast send failed peer=%s", peer.id)
                await self.disconnect(peer)
        return delivered

    async def broadcast_cursor(
        self,
        conn: Connection,
        position: dict[str, Any],
    ) -> int:
        return await self._broadcast(
            conn,
            {
                "kind": "cursor",
                "user_id": conn.user_id,
                "proposal_id": conn.proposal_id,
                "position": position,
            },
        )

    async def broadcast_comment(
        self,
        conn: Connection,
        comment: str,
        *,
        session: Session,
        aid: Optional[str] = None,
    ) -> int:
        """Persist the comment to ``pricing_audit`` and broadcast it.

        The audit row uses target_kind=``sku`` when an ``aid`` is
        available so the per-SKU audit drawer surfaces it. When no aid
        is available we still record against the proposal_id (target
        kind ``family`` is the closest stand-in; the front-end keys on
        the payload's ``proposal_id``).
        """
        target_id = aid or conn.proposal_id
        target_kind = (
            PricingAuditTargetKind.SKU if aid else PricingAuditTargetKind.FAMILY
        )
        record_audit(
            actor=conn.user_id,
            action=PricingAuditAction.PROPOSAL_COMMENTED,
            target_kind=target_kind,
            target_id=target_id,
            after={
                "proposal_id": conn.proposal_id,
                "aid": aid,
                "comment": comment,
            },
            reason=comment,
            session=session,
        )
        session.commit()
        return await self._broadcast(
            conn,
            {
                "kind": "comment",
                "user_id": conn.user_id,
                "proposal_id": conn.proposal_id,
                "comment": comment,
            },
        )


# Global channel used by the FastAPI WS endpoint.
channel = CollabChannel()


__all__ = ["CollabChannel", "Connection", "channel"]
