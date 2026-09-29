"""Persistence boundaries for orders."""

from delivery_router.api.schemas import OrderCreate, OrderResponse, OrderUpdate


class InMemoryOrderRepository:
    """Small development repository; replace with a database adapter later."""

    def __init__(self) -> None:
        self._orders: dict[str, OrderResponse] = {}

    def create(self, order: OrderCreate) -> OrderResponse:
        saved = OrderResponse(**order.model_dump())
        self._orders[saved.order_id] = saved
        return saved

    def list(self) -> list[OrderResponse]:
        return list(self._orders.values())

    def get(self, order_id: str) -> OrderResponse | None:
        return self._orders.get(order_id)

    def update(self, order_id: str, order: OrderUpdate) -> OrderResponse | None:
        if order_id not in self._orders:
            return None
        saved = OrderResponse(order_id=order_id, **order.model_dump())
        self._orders[order_id] = saved
        return saved

    def delete(self, order_id: str) -> bool:
        return self._orders.pop(order_id, None) is not None
