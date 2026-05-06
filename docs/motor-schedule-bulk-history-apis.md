# Motor Schedule — Bulk & History APIs

Base path: `/api/motor-schedules`
All routes require `Authorization: Bearer <token>` header.

---

## 1. Bulk Stop Schedules

Stop multiple schedules at once by providing their IDs.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/motor-schedules/bulk/stop` |
| **Auth** | Required |

**Request Body**
```json
{
  "ids": [1, 2, 3]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ids` | `number[]` | Yes | Array of schedule IDs to stop |

**Response `200`**
```json
{
  "status": true,
  "message": "Bulk schedules stopped successfully",
  "data": {
    "stopped_count": 3
  }
}
```

**Errors**
| Code | Message |
|------|---------|
| `400` | Array of schedule ids required |

---

## 2. Bulk Restart Schedules

Restart multiple stopped schedules by providing their IDs.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/motor-schedules/bulk/restart` |
| **Auth** | Required |

**Request Body**
```json
{
  "ids": [1, 2, 3]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ids` | `number[]` | Yes | Array of schedule IDs to restart |

**Response `200`**
```json
{
  "status": true,
  "message": "Bulk schedules restarted successfully",
  "data": {
    "restarted_count": 3
  }
}
```

**Errors**
| Code | Message |
|------|---------|
| `400` | Array of schedule ids required |

---

## 3. Bulk Delete Schedules

Soft-delete multiple schedules by providing their IDs. Marks them as `DELETED` / `ARCHIVED`.

| | |
|---|---|
| **Method** | `DELETE` |
| **URL** | `/api/motor-schedules/bulk` |
| **Auth** | Required |

**Request Body**
```json
{
  "ids": [1, 2, 3]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ids` | `number[]` | Yes | Array of schedule IDs to delete |

**Response `200`**
```json
{
  "status": true,
  "message": "Bulk schedules deleted successfully",
  "data": {
    "deleted_count": 3
  }
}
```

**Errors**
| Code | Message |
|------|---------|
| `400` | Array of schedule ids required |

---

## 4. Schedule History

Fetch the event timeline for all schedules belonging to a specific motor and starter, with optional date range filtering.

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/motor-schedules/history` |
| **Auth** | Required |

**Query Parameters**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `motor_id` | `number` | Yes | Motor (pump) ID |
| `starter_id` | `number` | Yes | Starter (device) ID |
| `from_date` | `string` | No | Start of date range — format `YYYY-MM-DD` |
| `to_date` | `string` | No | End of date range — format `YYYY-MM-DD` |
| `page` | `number` | No | Page number (default: `1`) |
| `page_size` | `number` | No | Records per page (default: `10`) |

**Example Request**
```
GET /api/motor-schedules/history?motor_id=5&starter_id=2&from_date=2026-04-01&to_date=2026-04-17&page=1&page_size=10
```

**Response `200`**
```json
{
  "status": true,
  "message": "Schedule history fetched successfully",
  "data": {
    "records": [
      {
        "id": 42,
        "schedule_id": 3,
        "schedule_type": "TIME_BASED",
        "schedule_status": "STOPPED",
        "start_time": "0600",
        "end_time": "1800",
        "schedule_start_date": 260401,
        "schedule_end_date": 260417,
        "repeat": 0,
        "events": [
          { "event": "CREATED",   "timestamp": "2026-04-01T08:00:00.000Z" },
          { "event": "SCHEDULED", "timestamp": "2026-04-01T08:01:05.000Z" },
          { "event": "RUNNING",   "timestamp": "2026-04-01T06:00:00.000Z" },
          { "event": "PAUSED",    "timestamp": "2026-04-01T10:30:00.000Z" },
          { "event": "DELETED",   "timestamp": "2026-04-02T09:00:00.000Z" }
        ]
      }
    ],
    "pagination": {
      "total_records": 25,
      "total_pages": 3,
      "page_size": 10,
      "current_page": 1,
      "next_page": 2,
      "prev_page": null
    }
  }
}
```

**Event Types**

| Event | Meaning |
|-------|---------|
| `CREATED` | Schedule was created |
| `SCHEDULED` | Device acknowledged the schedule |
| `RUNNING` | Schedule started executing |
| `PAUSED` | Manually stopped by user |
| `STOPPED` | Stopped automatically (completed/system) |
| `FAILED` | Device reported a failure |
| `DELETED` | Schedule was deleted |

**Errors**
| Code | Message |
|------|---------|
| `400` | Pump is required *(missing motor_id)* |
| `400` | Device is required *(missing starter_id)* |
| `400` | Invalid from_date. Use YYYY-MM-DD format |
| `400` | Invalid to_date. Use YYYY-MM-DD format |
