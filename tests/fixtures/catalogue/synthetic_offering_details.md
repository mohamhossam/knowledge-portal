# Office Connect, what it is made of and how it changes (synthetic)

## Systems

| System | ID | Function |
|---|---|---|
| Order Portal | SYS-PORTAL | Web storefront where business customers order and follow orders. |
| Flow Engine | SYS-FLOW | Fixed order orchestration. |
| Order Store | SYS-STORE | Order records and their status. |

## Channels

| Channel | Kind | Entry system |
|---|---|---|
| Business Web | Digital | Order Portal |
| Sales Agent | Assisted | — |

## Product: Office Connect

| Code | Family | Version | Lifecycle | Evidence | Source |
|---|---|---|---|---|---|
| OFFICE_CONNECT | Connect | 1.0.0 | REFERENCE | CONFIRMED | Synthetic design §1 |

### Order types

| Order type | Code | Channels | Evidence |
|---|---|---|---|
| New Activation | NEW | Business Web; Sales Agent | CONFIRMED |
| Up / Downgrade | UPDOWN | Business Web | CONFIRMED |

### Components

| Component | Code | Type | Mandatory | Evidence |
|---|---|---|---|---|
| Fibre Access | PO_FIBRE | SERVICE | Yes | CONFIRMED |

### Realisation

| Component | Layer | Realised as | Evidence | Source |
|---|---|---|---|---|
| Fibre Access | CFS | Business Fibre Service | CONFIRMED | Synthetic design §2 |
| Fibre Access | RFS | GPON Access | INFERRED | Synthetic design §2 |
| Managed Router | Resource | Office CPE | CONFIRMED | Synthetic design §2 |

### Non-functional requirements

| Quality | Coverage | Statement | Evidence | Source |
|---|---|---|---|---|
| Availability | Defined | 99.9% a month for the access line. | CONFIRMED | Synthetic design §7 |
| Performance | Partial | Order capture answers within 3 seconds; fulfilment is not stated. | INFERRED | Synthetic design §7 |
| Security | Missing | — | GAP | Synthetic design §7 |

### Order tracking

- **Applies to:** New Activation
- **Not tracked:** Up / Downgrade orders are not followed in the portal.
- **Evidence:** CONFIRMED — Synthetic design §8

The customer follows a fibre order from capture to activation.

| From | To | What | Interface | Evidence |
|---|---|---|---|---|
| Flow Engine | Order Store | Order status events | Status API | CONFIRMED |
| Order Store | Order Store | Milestone log | — | INFERRED |

| Channel | Correlation key | Tracked in | Read from | Read over | Evidence |
|---|---|---|---|---|---|
| Business Web | Portal order id | Order Portal | Order Store | getOrderDetails | CONFIRMED |
| Sales Agent | Not defined | — | — | — | GAP |

| Milestone | Detail | System | Evidence |
|---|---|---|---|
| Order received | Shown once capture completes. | Order Portal | CONFIRMED |
| Activated | The line is live. | — | CONFIRMED |

| Status | Detail |
|---|---|
| AWAITING_SURVEY | Waiting for the site survey. |

| Fallout | Handling | Evidence |
|---|---|---|
| Survey failed | A planner books the visit again. | CONFIRMED |

### Lifecycle: Up / Downgrade scenario matrix

- **Kind:** Change
- **Order types:** Up / Downgrade
- **Evidence:** CONFIRMED — Synthetic design §10

Which workflow each transition runs.

| From | To | Workflow |
|---|---|---|
| Fibre 100 | Fibre 500 | WF-1 |
| Fibre 500 | Fibre 100 | WF-2 |

Transitions run on the summary order path.

### Lifecycle: Renewal

- **Kind:** Commercial
- **Channels:** Business Web

#### v1 carry-over (to re-verify)

- Inherit the remaining tenure
- Start a fresh 24-month commitment
