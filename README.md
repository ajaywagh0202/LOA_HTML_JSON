# IREPS LOA HTML Parser

A complete MERN-style application for uploading IREPS LOA HTML files, extracting important LOA fields, and storing the parsed result in MongoDB.

## Folder Structure

```text
backend/
  src/
    config/db.js
    controllers/loaController.js
    middleware/errorHandler.js
    middleware/upload.js
    models/LoaLetter.js
    routes/loaRoutes.js
    utils/asyncHandler.js
    utils/loaParser.js
    app.js
    server.js
  .env.example
  package.json

frontend/
  src/
    api/loaApi.js
    components/Layout.jsx
    pages/EditLoaPage.jsx
    pages/LoaDetailsPage.jsx
    pages/LoaListPage.jsx
    pages/UploadLoaPage.jsx
    App.jsx
    main.jsx
    styles.css
  .env.example
  index.html
  package.json
```

## Requirements

- Node.js 18+
- Local MongoDB running on `mongodb://127.0.0.1:27017`

## Backend Setup

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Backend runs at `http://localhost:5000`.

## Frontend Setup

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
npm run dev -- --host IP_ADDRESS
```

Frontend runs at `http://localhost:5173`.

## Environment

`backend/.env.example`

```env
MONGO_URI=mongodb://127.0.0.1:27017/loa_db
PORT=5000
CLIENT_ORIGIN=http://localhost:5173
```

For LAN access during development, `CLIENT_ORIGIN` can be comma-separated:

```env
CLIENT_ORIGIN=http://localhost:5173,http://127.0.0.1:5173,http://10.31.3.114:5173
```

The backend also allows private-network Vite dev origins on port `5173` when `NODE_ENV` is not `production`.

`frontend/.env.example`

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

## API Examples

Upload an LOA HTML file:

```bash
curl -X POST http://localhost:5000/api/loa/upload \
  -F "file=@sample-loa.html"
```

List LOA records:

```bash
curl "http://localhost:5000/api/loa?page=1&limit=10&search=00964230154297"
```

Get by MongoDB id:

```bash
curl http://localhost:5000/api/loa/665f2f0a9ad4c92f90c9e123
```

Get by LOA number:

```bash
curl http://localhost:5000/api/loa/by-number/00964230154297
```

Update a record:

```bash
curl -X PUT http://localhost:5000/api/loa/665f2f0a9ad4c92f90c9e123 \
  -H "Content-Type: application/json" \
  -d "{\"contractor_name\":\"Updated Contractor\",\"json_data\":{\"note\":\"manual update\"}}"
```

Delete a record:

```bash
curl -X DELETE http://localhost:5000/api/loa/665f2f0a9ad4c92f90c9e123
```

## Parser Behavior

- Accepts only `.html` and `.htm` uploads.
- Uses Cheerio to parse HTML.
- Prefers `span#letterNoVal` for the full letter number.
- Extracts `loa_no` from the last segment of the full letter number.
- Falls back to regex-based extraction from visible `Letter No` text.
- Extracts direct hidden inputs such as `bidId`, `tdId`, `tdVersion`, and `input[id^="loaData"]`.
- Decodes HTML entities before parsing hidden JSON data.
- Extracts `json_data.schedule_breakup` and `json_data.item_breakup` as schedule-first data from Awarded Quantities And Rates.
- Uses Awarded Quantities schedule rows as masters, follows View Details anchors into Item Breakup for MS/DSR item details, and keeps Not Applicable schedule item rows directly under that schedule.
- Upserts by `loa_no`, so uploading the same LOA updates the existing MongoDB document.

`json_data.schedule_breakup` / `json_data.item_breakup` shape:

```json
[
  {
    "schedule_id": "23975785",
    "item_sno": "01",
    "item_desc": "Schedule description...",
    "description": "Schedule 01-... (Item Directory - ...)",
    "item_directory": "Part A- MS Item (CPWD DSR-2023 items)",
    "schedule_item_directory": "CPWD DSR 2023-Ver-1",
    "advt_value": "...",
    "bid_rate_or_unit_rate": "...",
    "bid_type_text": "% Below",
    "bid_amount": "...",
    "schedule_total": "...",
    "awarded_items": [],
    "item_breaks": [
      {
        "item_sno": "1",
        "item_code": "1.1.18",
        "item_desc": "...",
        "qty_unit": "...",
        "item_qty": "...",
        "unit_rate": "...",
        "amount": "..."
      }
    ]
  }
]
```
