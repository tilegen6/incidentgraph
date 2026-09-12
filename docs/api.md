# REST API

Base URL: `http://localhost:4100/api` (direct) or `http://localhost:3100/api` (Next.js proxy). The demo intentionally allows public, read-only access. Every write requires the signed `ig_session` cookie.

| Method | Route                               | Purpose                                                       |
| ------ | ----------------------------------- | ------------------------------------------------------------- |
| GET    | `/health`                           | Readiness after storage initialization                        |
| POST   | `/auth/login`                       | Email/password demo session                                   |
| POST   | `/auth/logout`                      | Clear current session                                         |
| GET    | `/auth/me`                          | User or `null`                                                |
| GET    | `/bootstrap?environment=production` | Workspace snapshot, dependencies, incidents, traces, releases |
| GET    | `/incidents`                        | Paginated filtered incident list                              |
| GET    | `/incidents/:id`                    | Incident, analysis, events, annotations                       |
| POST   | `/incidents`                        | Declare incident                                              |
| PATCH  | `/incidents/:id`                    | Update status and/or owner                                    |
| POST   | `/incidents/:id/analyze`            | Recalculate from incident evidence                            |
| POST   | `/incidents/:id/annotations`        | Add an investigation note                                     |
| POST   | `/ingest`                           | Validate, correlate, analyze and persist an anomaly batch     |
| GET    | `/logs`                             | Paginated logs and matching-event histogram                   |
| GET    | `/metrics`                          | Selected metric series; optional Redis read cache             |
| GET    | `/search`                           | Incidents, services, log messages, trace IDs                  |

Read filters: `environment=production|staging`, `q`, `service`, `level=ERROR|WARN|INFO|DEBUG|all`, `page`, `pageSize` (max 100), `range=15m|1h|6h|24h`. Incidents additionally accept `status`, `severity`, and ISO `from`.

Search supports case-insensitive substring matching, OR alternatives, and AND-required terms. It is deliberately not a SQL query language. Metrics use five-minute samples. Aggregated latency and error rate are request-weighted; throughput is summed; CPU and memory are averaged.

## Login

```sh
curl -c cookies.txt http://localhost:4100/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@incidentgraph.dev","password":"investigate-demo"}'
```

## Ingest

```sh
curl -b cookies.txt http://localhost:4100/api/ingest \
  -H 'Content-Type: application/json' \
  --data-binary @docs/sample-ingestion.json
```

The adapter accepts up to 100 events per request, a 256 KB body, and 60 write requests per minute per IP per process. Event IDs are deduplicated against stored incident events. The synchronous processor serializes batch admission; production streaming should use a durable queue and transactional deduplication. Below-threshold noise does not create an incident. Batches are correlated independently in v1; cross-batch incident merging is a future improvement.

Errors use meaningful HTTP status codes and a `message` field: 400 validation, 401 authentication, 403 origin, 404 unknown incident, 429 write-rate limit. Unexpected errors return 500. Structured server logs include request ID, route, status, and duration without request bodies or credentials.
