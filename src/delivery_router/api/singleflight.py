"""Coalesce only overlapping work. Completed provider responses are not cached."""
from concurrent.futures import Future, TimeoutError
from threading import Lock

from delivery_router.api.errors import ApiError


class SingleFlight:
    def __init__(self):
        self.lock = Lock()
        self.pending = {}

    def run(self, key, work):
        with self.lock:
            leader = key not in self.pending
            future = self.pending.setdefault(key, Future())
        if not leader:
            try:
                return future.result(timeout=30)
            except TimeoutError:
                raise ApiError(503, "map_provider_unavailable", "Google request is still pending. Try again shortly.") from None
        try:
            result = work()
            future.set_result(result)
            return result
        except BaseException as error:
            future.set_exception(error)
            raise
        finally:
            with self.lock:
                self.pending.pop(key, None)
