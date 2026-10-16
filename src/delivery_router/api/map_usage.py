"""Atomic, durable reservations before provider attempts; stores counts, not addresses."""
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
import sqlite3
from threading import Lock

from delivery_router.api.errors import ApiError


class MapUsage:
    def __init__(self, path, monthly_limit_usd=5, geocoding_daily_limit=500,
                 matrix_daily_limit=2000, clock=None):
        self.path = str(path)
        self.monthly_limit = Decimal(str(monthly_limit_usd))
        self.daily_limits = {"geocoding": geocoding_daily_limit, "route_matrix": matrix_daily_limit}
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.lock = Lock()
        self.memory = None

    def _connect(self):
        if self.path == ":memory:":
            if self.memory is None:
                self.memory = sqlite3.connect(":memory:", check_same_thread=False)
            connection = self.memory
        else:
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
            connection = sqlite3.connect(self.path, timeout=5)
        try:
            connection.execute("CREATE TABLE IF NOT EXISTS usage (day TEXT, operation TEXT, units INTEGER NOT NULL, PRIMARY KEY(day, operation))")
        except sqlite3.Error:
            if connection is not self.memory:
                connection.close()
            raise
        return connection

    def _run(self, operation=None, units=0):
        with self.lock:
            connection = None
            try:
                connection = self._connect()
                connection.execute("BEGIN IMMEDIATE")
                today = self.clock().strftime("%Y-%m-%d")
                month = today[:7]
                rows = connection.execute("SELECT day, operation, units FROM usage WHERE day LIKE ?", (month + "%",)).fetchall()
                counts = {key: sum(row[2] for row in rows if row[1] == key) for key in self.daily_limits}
                today_counts = {key: sum(row[2] for row in rows if row[0] == today and row[1] == key) for key in self.daily_limits}
                # Conservative $5 / 1,000 units for each current Essentials SKU.
                # Free allowances, credits and volume discounts are deliberately ignored.
                total = sum(counts.values())
                if operation is not None:
                    daily = sum(row[2] for row in rows if row[0] == today and row[1] == operation)
                    if Decimal(total + units) * Decimal("0.005") > self.monthly_limit:
                        raise ApiError(503, "map_usage_limit_reached", "This app's monthly Google usage allowance has been reached. Your orders are preserved; ask the administrator to review usage.")
                    if daily + units > self.daily_limits[operation]:
                        raise ApiError(503, "map_usage_limit_reached", "This app's daily Google usage allowance has been reached. Your orders are preserved; try after the UTC daily reset.")
                    connection.execute("INSERT INTO usage(day, operation, units) VALUES(?,?,?) ON CONFLICT(day,operation) DO UPDATE SET units=usage.units+excluded.units", (today, operation, units))
                    counts[operation] += units
                    today_counts[operation] += units
                    total += units
                # Retain counters only for the current month; no provider content stored.
                connection.execute("DELETE FROM usage WHERE day < ?", (month + "-01",))
                connection.commit()
                gross = Decimal(total) * Decimal("0.005")
                return {"month_utc": month, "day_utc": today, "reserved_units": counts, "reserved_today": today_counts,
                        "estimated_gross_cost_usd": float(gross),
                        "monthly_limit_usd": float(self.monthly_limit),
                        "remaining_gross_allowance_usd": float(max(Decimal(0), self.monthly_limit - gross)),
                        "daily_limits": self.daily_limits,
                        "basis": "Conservative reservations at USD 5 per 1000 units; ignores free usage and credits; not a Google invoice."}
            except ApiError:
                if connection is not None:
                    connection.rollback()
                raise
            except (sqlite3.Error, OSError):
                if connection is not None:
                    connection.rollback()
                raise ApiError(503, "map_usage_unavailable", "Google usage tracking is unavailable. Requests are paused to preserve the usage limit.") from None
            finally:
                if connection is not None and connection is not self.memory:
                    connection.close()

    def reserve(self, operation, units):
        if operation not in self.daily_limits or type(units) is not int or units < 1:
            raise ValueError("Invalid Google usage reservation")
        self._run(operation, units)

    def snapshot(self):
        return self._run()
