# Ordering channels (synthetic)

## Systems

| System | ID | Function |
|---|---|---|
| Order Portal | SYS-PORTAL | Web storefront for business customers. |
| Sales Desk | SYS-SALES | Agent sales tool. |
| Flow Engine | SYS-FLOW | Fixed order orchestration. |

## Channels

| Channel | Kind | Entry system | Description |
|---|---|---|---|
| Business Web | Digital | Order Portal | Un-assisted web ordering. |
| Sales Agent | Assisted | Sales Desk | Ordering through an agent. |
| Partner Feed | System | — | Orders sent by partners. |

---

## Product: Office Connect

| Code | Family | Version | Lifecycle | Evidence | Source |
|---|---|---|---|---|---|
| OFFICE_CONNECT | Connect | 1.0.0 | REFERENCE | CONFIRMED | Synthetic design §1 |

### Order types

| Order type | Code | Channels | Evidence |
|---|---|---|---|
| New Activation | NEW | Business Web; Sales Agent | CONFIRMED |
| Cessation | CEASE | Sales Agent | CONFIRMED |

---

## Journey: New Activation

### Activities

| # | Phase | Track | Activity | Performing system | Channels | Evidence |
|---|---|---|---|---|---|---|
| 10 | CAPTURE | MAIN | Capture the order | Channel | — | CONFIRMED |
| 15 | CAPTURE | MAIN | Confirm the quote with the customer | Sales Desk | Sales Agent | CONFIRMED |
| 20 | VALIDATION | MAIN | Validate order | Flow Engine | — | CONFIRMED |
