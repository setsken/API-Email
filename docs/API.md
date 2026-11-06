## API for external programs

A read-only API for programs that need codes and verification links from the admin panel's folders. Each key only sees the folders chosen for it. The `/api/docs` page of your installation has the same reference in Russian, with code samples.

Create a key in the admin panel under **API**. It is shown once. Send it with every request:
```http
Authorization: Bearer mdk_your_key
```
`X-API-Key: mdk_your_key` works too. All times are Unix seconds.

### Messages
The newest emails, newest first. Each has a code or a verification link: the service doesn't keep other emails.
```http
GET /api/v1/messages?address=you@yourdomain.com&since=1793980000&limit=1
```
| Parameter | Description |
| --------- | ----------- |
| `address` | Only emails to this address. |
| `folder`  | Only emails of this folder (its `id`). |
| `since`   | Only emails received at this time or later. |
| `limit`   | How many to return, 1 to 100, 20 by default. |

**Response**
```json
{
  "messages": [
    {
      "id": "6f1c2b9e4a7d4c0e8b1f3a5d7c9e2b40",
      "address": "you@yourdomain.com",
      "note": "Fansly #5",
      "folder": {"id": "a1b2c3d4", "name": "Fansly"},
      "code": "241553",
      "link": null,
      "from": "Fansly <noreply@fansly.com>",
      "subject": "Your login code",
      "received_at": 1793980800,
      "received_at_iso": "2026-11-06T16:00:00Z"
    }
  ],
  "server_time": 1793980805
}
```

To wait for a code: remember `server_time` from any response, make the site send the code, then poll `/messages?address=...&since=...&limit=1` every 3 to 5 seconds. Without `since` you may get an older code.

### One message
The same fields plus the html of the email in `body`.
```http
GET /api/v1/messages/{id}
```

### Addresses
The addresses in the key's folders. `folder` narrows them down to one folder.
```http
GET /api/v1/addresses?folder=a1b2c3d4
```

### Folders
The key's folders with the number of addresses in each.
```http
GET /api/v1/folders
```

### Errors and limits
Errors come with `error` (a code) and `message` fields.

| Status | `error` | When |
| ------ | ------- | ---- |
| 400 | `bad_request` | A wrong `limit` or `since`. |
| 401 | `invalid_api_key` | No key, a wrong key or a deleted one. |
| 404 | `address_not_found`, `folder_not_found`, `message_not_found` | Not in the key's folders. |
| 429 | `rate_limited` | More than 600 requests a minute per key; see `Retry-After`. |

## Temporary mail routes

These are the routes behind the public temporary mail page.

### Get Inbox
Gets the current inbox of an email address. An address listed in the admin panel looks like an empty inbox unless the logged in panel account has access to its folder.
```http
GET /get_inbox?address=you@yourdomain.com
```
**Parameters**
| Parameter | Description               |
| --------- | ------------------------- |
| `address` | The email address to get. |

**Response**
```json
[
  {
    "Id": "6f1c2b9e4a7d4c0e8b1f3a5d7c9e2b40",
    "From": "sender@example.com",
    "To": "you@yourdomain.com",
    "Subject": "Hello",
    "Timestamp": 1764072990,
    "Body": "This is a test email.",
    "Sent": "Nov 25 at 12:16:30",
    "ContentType": "Text",
    "Code": null,
    "Link": null
  }
]
```

### Get Random Address
Generates a random email address using one of the domains
```http
GET /get_random_address
```
**Response**
```json
{
  "address": "x9a2k1@yourdomain.com"
}
```

### Get Domains
Gets all available domains
```http
GET /get_domains
```
**Response**
```json
{
  "domains": ["yourdomain.com"]
}
```
