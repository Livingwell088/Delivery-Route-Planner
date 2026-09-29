# Phase 1: Product specification and test data

## V1 goal

V1 helps a delivery driver scan restaurant receipts, verify the extracted
order information, compare a provisional delivery route as orders are added or
removed, and launch the final route in the driver's preferred navigation app.

## Scan-to-navigation workflow

1. The driver photographs one receipt at a time because each receipt is
   attached to its physical order.
2. The app extracts the order number, order-placed time, and delivery address.
3. The selected map provider checks whether the address is recognized.
4. The driver compares all extracted values with the physical receipt and
   corrects any errors.
5. The driver confirms the scan. The order is automatically added to the
   current order list; a separate accept step is not required.
6. The app recalculates and displays a provisional route after every confirmed
   order.
7. The driver may remove an order that is not a good fit. The app asks for
   confirmation before removal and recalculates the provisional route after
   the order is removed.
8. The driver repeats the process for any additional receipts.
9. When all desired orders have been captured, the driver selects **Submit**.
10. The app presents the final recommended delivery sequence.
11. The driver may manually rearrange the sequence. Before accepting an
    override, the app warns that the change may increase driving time or
    customer wait time.
12. The app launches the route in the driver's default navigation app.
13. After each delivery, the driver marks the order delivered and continues to
    the next stop.
14. After the final delivery, navigation automatically returns the driver to
    the restaurant.

## Extracted information

Every receipt must provide these fields:

- **Order number:** Identifies the physical order and food bag.
- **Order-placed time:** Determines the order's age and customer wait time.
- **Delivery address:** Supplies the navigation destination.

Orders appear in the route list using the order number and a shortened street
address, for example: **Order #108 - 12 Main St**. The complete address remains
available for validation and navigation.

## Confirmation and validation

Before an order is added, the confirmation screen displays all extracted
fields and the address-recognition result. An address is ready for routing only
when both conditions are true:

- The map provider recognizes a navigable location.
- The driver confirms that the recognized address matches the receipt.

The driver can correct each extracted value before confirming the order.

## Error behavior

- If the order number cannot be read, the driver must enter it manually.
- If the order-placed time cannot be read, the driver must enter it manually.
- If the address cannot be read or recognized, the driver must correct it
  before adding the order.
- If an order number already exists in the active list, the app warns the
  driver and prevents an accidental duplicate.
- Removing an order requires confirmation to prevent accidental removal.
- If the driver rearranges the recommended route, the app displays: "Changing
  the recommended order may increase driving time or cause a later delivery.
  Continue with this route?"

## Navigation preference

The driver selects Apple Maps or Google Maps as the default navigation app in
Settings. The final route opens in that default app.

## Route scoring

The route optimizer uses the Phase 2 scoring rule. Lower scores are preferred:

```text
score =
    total driving minutes
    + total customer wait minutes
    + (10 x total minutes beyond 45)
```

The provisional route is recalculated whenever an order is added or removed.
Selecting **Submit** finalizes the current group of orders; it does not trigger
the first calculation.

## Receipt test data

Collect approximately 20-50 representative receipt images, including:

- Clear receipts
- Blurry or tilted images
- Different lighting conditions
- Apartment or unit numbers
- Similar street names
- Missing ZIP codes
- Reprinted receipts
- Different receipt layouts

Raw receipts and customer information must remain outside version control.
Before any receipt is committed, permanently replace or redact names, phone
numbers, real addresses, payment information, order identifiers, barcodes, QR
codes, and any other identifying information. Use fictional replacements when
the structure of a field is needed for testing.

Receipt collection may continue while other specification work proceeds, but
Phase 1 is not complete until the representative anonymized test set exists.



## Completion criteria

Phase 1 is complete when:

- Descriptions of the project is stated in detail.
- Test data is provided



## Developer's Note to Self

- Phase 1 was basically the overview of the project
- The specific description and details of the project was stated.
- The intended process of use for the app was specified.
- The ideal end product
- Had the AI generate a test data set using an image of the restaurant's receipt. Everything from a normal receipt to a different angle to different shades.
