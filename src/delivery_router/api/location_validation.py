"""Signed, short-lived provider snapshots. Client coordinates never establish trust."""

import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

from delivery_router.api.errors import ApiError
from delivery_router.api.schemas import (
    Address, AddressCandidate, AddressConfirmationRequest, ValidatedLocation,
)


class LocationValidation:
    # A separate signing key derived from the server-only Google credential survives
    # restarts. Rotating that credential deliberately invalidates existing references.
    def __init__(self, secret: str, clock=None):
        self.key = hmac.digest(secret.encode(), b"route-runner-location-v1", "sha256")
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def _sign(self, kind, data, lifetime):
        payload = {"version": 1, "kind": kind, "expires": (self.clock() + lifetime).timestamp(), "data": data}
        encoded = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode()
        return encoded + "." + hmac.new(self.key, encoded.encode(), hashlib.sha256).hexdigest()

    def _read(self, token, kind):
        try:
            if len(token) > 100_000:
                raise ValueError()
            encoded, signature = token.split(".")
            if not hmac.compare_digest(signature, hmac.new(self.key, encoded.encode(), hashlib.sha256).hexdigest()):
                raise ValueError()
            payload = json.loads(base64.b64decode(encoded, altchars=b"-_", validate=True))
            if payload["version"] != 1 or payload["kind"] != kind or payload["expires"] <= self.clock().timestamp():
                raise ValueError()
            return payload["data"]
        except (ValueError, KeyError, TypeError):
            raise ApiError(422, "location_review_required", "Address confirmation is missing, expired or changed. Look up and confirm the address again.") from None

    def lookup(self, raw, result):
        usable = [c.model_dump(mode="json") for c in result.candidates if c.is_usable]
        if not usable:
            return result
        return result.model_copy(update={"lookup_reference": self._sign("lookup", {
            "raw": raw, "unit": result.unit, "candidates": usable,
        }, timedelta(minutes=15))})

    def confirm(self, request: AddressConfirmationRequest) -> Address:
        snapshot = self._read(request.lookup_reference, "lookup")
        candidate = next((c for c in snapshot["candidates"] if c["candidate_id"] == request.candidate_id), None)
        if snapshot["raw"] != request.address or candidate is None:
            raise ApiError(422, "location_review_required", "The selected destination does not match this address lookup.")
        candidate = AddressCandidate.model_validate(candidate)
        now = self.clock()
        location = ValidatedLocation(
            place_id=candidate.place_id, normalized_address=candidate.normalized_address,
            coordinates=candidate.coordinates, validation_reference="pending",
            validated_at=now, expires_at=now + timedelta(hours=8),
        )
        label = candidate.normalized_address
        if snapshot["unit"]:
            label = f"{label} · {snapshot['unit']}"
        address = Address(formatted_address=label, raw_address=request.address,
                          unit=snapshot["unit"], coordinates=candidate.coordinates, validated_location=location)
        data = address.model_dump(mode="json")
        data["validated_location"].pop("validation_reference")
        location.validation_reference = self._sign("confirmed", data, timedelta(hours=8))
        return address

    def resolve(self, address: Address) -> Address:
        if address.validated_location is None:
            raise ApiError(422, "location_review_required", "Confirm every destination and the restaurant before optimizing.")
        token = address.validated_location.validation_reference
        trusted = self._read(token, "confirmed")
        supplied = address.model_dump(mode="json")
        supplied["validated_location"].pop("validation_reference")
        if supplied != trusted:
            raise ApiError(422, "location_review_required", "An address changed after confirmation. Look up and confirm it again.")
        return address.model_copy(deep=True)
