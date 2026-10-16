"""Conservative US receipt-input normalization and Google candidate assessment.

Only user input is parsed as text. Provider components are read by their types,
never by splitting Google's display address. No locality is invented from bias.
"""

from dataclasses import dataclass
import re
import unicodedata

from pydantic import ValidationError

from delivery_router.api.errors import ApiError
from delivery_router.api.schemas import AddressCandidate, AddressContext, Coordinates


_UNIT = re.compile(
    r"(?<!\w)(?:apt\.?|apartment|suite|ste\.?|unit|room|rm\.?|floor|fl\.?|#)"
    r"\s*#?\s*([\w/-]+)(?=\s*(?:,|$))", re.IGNORECASE,
)
_STATE_ZIP = re.compile(r"^(?P<state>[A-Za-z]{2})(?:\s+(?P<zip>\d{5}(?:-\d{4})?))?$")
_HOUSE_STREET = re.compile(r"^(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?(?:\s+1/2)?)\s+(.+)$")
_WORDS = {
    "st": "street", "rd": "road", "ave": "avenue", "av": "avenue",
    "blvd": "boulevard", "dr": "drive", "ln": "lane", "ct": "court",
    "pl": "place", "sq": "square", "ter": "terrace", "pkwy": "parkway",
    "hwy": "highway", "cir": "circle", "n": "north", "s": "south",
    "e": "east", "w": "west", "ne": "northeast", "nw": "northwest",
    "se": "southeast", "sw": "southwest",
}


def _key(value: str) -> str:
    return " ".join(re.findall(r"\w+", unicodedata.normalize("NFKC", value).casefold()))


def _street_key(value: str) -> str:
    return " ".join(_WORDS.get(word, word) for word in _key(value).split())


@dataclass(frozen=True)
class AddressInput:
    query: str
    unit: str | None
    context: AddressContext
    street_number: str | None
    street: str | None


def normalize_address_input(address: str, context: AddressContext | None = None) -> AddressInput:
    text = " ".join(unicodedata.normalize("NFKC", address).split())
    unit = None
    match = _UNIT.search(text)
    # Avoid interpreting a street such as '10 Unit Street' as a unit alone.
    if match and re.search(r"\d.+[A-Za-z]", text[:match.start()]):
        unit = match.group().strip()
        text = (text[:match.start()].rstrip(" ,") + text[match.end():]).strip(" ,")
    parts = [part.strip() for part in text.split(",") if part.strip()]
    inferred: dict[str, str] = {}
    if parts and _key(parts[-1]) in {"us", "usa", "united states", "united states of america"}:
        inferred["country"] = "US"
        parts.pop()
    if len(parts) >= 2:
        state_zip = _STATE_ZIP.fullmatch(parts[-1])
        if state_zip:
            inferred["state"] = state_zip["state"].upper()
            if state_zip["zip"]:
                inferred["postal_code"] = state_zip["zip"]
            if len(parts) >= 3:
                inferred["city"] = parts[-2]
    # Text remains authoritative when explicit context contradicts it. A caller
    # cannot hide a supplied town by setting a different context city.
    supplied = context.model_dump(exclude_none=True) if context else {}
    resolved_context = AddressContext(**{**supplied, **inferred})
    house = _HOUSE_STREET.fullmatch(parts[0]) if parts else None
    additions = [supplied[field] for field in ("city", "state", "postal_code", "country")
                 if field in supplied and field not in inferred]
    query = ", ".join([text, *additions])
    return AddressInput(query, unit, resolved_context,
                        house[1] if house else None, house[2] if house else None)


def google_candidate(result: object, address: AddressInput) -> AddressCandidate:
    """Translate a structurally sound Google result and flag delivery risks."""
    try:
        if not isinstance(result, dict):
            raise ValueError("Expected a result object")
        components = result["address_components"]
        if not isinstance(components, list):
            raise ValueError("Expected structured address components")
        by_type: dict[str, dict] = {}
        for component in components:
            if not isinstance(component, dict) or not isinstance(component.get("types"), list):
                raise ValueError("Malformed address component")
            for kind in component["types"]:
                if not isinstance(kind, str):
                    raise ValueError("Malformed address component type")
                by_type.setdefault(kind, component)

        def value(kind: str, short: bool = False) -> str | None:
            component = by_type.get(kind, {})
            item = component.get("short_name" if short else "long_name")
            if item is not None and (not isinstance(item, str) or not item.strip()):
                raise ValueError("Malformed component value")
            return item

        geometry = result["geometry"]
        location = geometry["location"]
        types = result["types"]
        if not isinstance(types, list) or not all(isinstance(item, str) for item in types):
            raise ValueError("Malformed result types")
        partial = result.get("partial_match", False)
        if not isinstance(partial, bool):
            raise ValueError("Malformed partial match")
        state_name = value("administrative_area_level_1")
        candidate = AddressCandidate(
            candidate_id=result["place_id"], place_id=result["place_id"],
            normalized_address=result["formatted_address"],
            coordinates=Coordinates(latitude=location["lat"], longitude=location["lng"]),
            street_number=value("street_number"), street=value("route"),
            city=value("locality") or value("postal_town") or value("administrative_area_level_3"),
            state=value("administrative_area_level_1", short=True),
            postal_code=value("postal_code"), country=value("country", short=True),
            location_type=geometry.get("location_type"), partial_match=partial,
        )
    except (KeyError, TypeError, ValueError, ValidationError) as exc:
        raise ApiError(503, "map_provider_unavailable", "Google Maps returned an incomplete address result") from exc

    warnings: list[str] = []
    usable = bool(
        {"street_address", "premise", "subpremise"}.intersection(types)
        and all((candidate.street_number, candidate.street, candidate.city, candidate.state, candidate.country))
        and candidate.location_type in {"ROOFTOP", "RANGE_INTERPOLATED"}
    )
    if not usable:
        warnings.append("This result does not identify a sufficiently precise delivery address. Correct the address.")
    if partial:
        warnings.append("Google Maps returned a partial match; review the destination before confirming.")
    if candidate.location_type == "RANGE_INTERPOLATED":
        warnings.append("The building position is estimated along the street; verify the destination.")
    if address.street_number and _key(address.street_number) != _key(candidate.street_number or ""):
        warnings.append("The returned street number differs from the entered address.")
    if address.street and _street_key(address.street) != _street_key(candidate.street or ""):
        warnings.append("The returned street name differs from the entered address.")
    for field, label in (("city", "town/city"), ("state", "state"), ("country", "country")):
        expected = getattr(address.context, field)
        actual = getattr(candidate, field)
        if expected and _key(expected) != _key(actual or ""):
            if field == "state" and _key(expected) == _key(state_name or ""):
                continue
            # Country spelling may be explicit in structured context.
            if field == "country" and _key(expected) in {"usa", "united states", "united states of america"} and actual == "US":
                continue
            warnings.append(f"The returned {label} differs from the entered address.")
    if address.context.postal_code and address.context.postal_code[:5] != (candidate.postal_code or "")[:5]:
        warnings.append("The returned ZIP code differs from the entered address.")
    if not address.context.city:
        warnings.append("No town/city was supplied; verify the returned locality.")
    if not address.street_number or not address.street:
        warnings.append("Enter a street number and street name before confirming a delivery address.")
    if not candidate.postal_code:
        warnings.append("Google Maps did not return a ZIP code; verify the complete destination.")
    candidate.is_usable = usable
    candidate.requires_review = bool(warnings)
    if address.unit:
        warnings.append("The apartment, suite, or room is preserved separately and has not been verified by Google Maps.")
    candidate.warnings = warnings
    return candidate
