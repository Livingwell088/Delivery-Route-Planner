# Phase 2: Routing algorithm prototype

## Scope

The prototype is an isolated Python package. It will accept a restaurant,
multiple delivery orders, and a travel-time matrix. It will compare:

1. Shortest route
2. Oldest order first
3. Age-aware exhaustive optimization

Each result will include predicted delivery times, total driving time, average
and maximum customer wait, severely late order count, and an explanation of
the selected sequence. OR-Tools is intentionally deferred.

## Planned module boundaries

- `models.py`: validated inputs and result types
- `scoring.py`: configurable objective and penalties
- `strategies.py`: exhaustive search and baselines
- `metrics.py`: route measurements and comparisons
- `explanations.py`: customer-readable route rationale

## Data policy

Only synthetic or fully anonymized fixtures belong in `data/fixtures/`. Raw
receipts and customer information must remain outside version control.


## Scoring Rule

route score = total driving time + total customer waiting time + severe-lateness penalties

wait at delivery = age at route start + elapsed time until delivery
late minutes = max(0, wait at delivery - 45)

score = total driving time + total customer waiting time + 10 x total late minutes



## Developer's Note to Self
- This phase was the start to the code of the project
- Started with creating the base of the project from the models:
    - **Order** (order id, delivery stop id, current time from when the order was placed)
    - **TravelTimeMatrix** (times) basically a matrix (nested dict) that lists the time it takes to travel from either the restaurant(start) or an order to another order.
            R   A   B   C
        R   0   1   2   3
        A   1   0   2   3
        B   1   2   0   3
        C   1   2   3   0
    - **DeliveryPrediction** (order, elapsed minutes, wait minutes, late minutes) which basically stores the predicted delivery time, wait time and late time of a single order 
    - **RouteEvaluation** (resturant id, deliveries, total driving minutes, score) evaluate a complete delivery route. It store:
        - The order of the deliveries
        - The total customer wait time (all orders)
        - The average customer wait time
        - The max customer wait time
        - The total late time of deliveries
        - The number of order that will be delivered after the severely late time
- Decided the scoring model for the route calculation
    - score = driving weight * driving minutes + waiting weight * customer wait minutes + late weight * total late minutes
- Decided current configurations
    - Severe Late Threshold: after 45 minutes
    - Driving weight: 1
    - Waiting Weight: 1
    - Late Weight: 10
- Implemented evaluate_route():
    - Given orders in an sorted order, starting at the restaurant, calculate the delivery time and totals the total driving, total wait time for each order and returns the score for that route
- 3 strategies to decide the order of the orders
    - Shortest route:
        - The route with the least driving time
    - Oldest first:
        - The route that prioritizes time since order was made
    - Age-aware:
        - Calculates the score for each possible ordering and use the one with the best score

        






