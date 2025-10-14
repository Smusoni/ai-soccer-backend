# AI Soccer Backend (MVP)

Simple Node/Express server with a mock analyzer and player similarity.
- `POST /analyze` (multipart) with fields:
  - `video`: the uploaded file
  - `attributes`: JSON string containing: `height_cm`, `dominant_foot` (`left`|`right`|`two-footed`), `position` (`winger`|`striker`|`midfielder`|`defender`|`goalkeeper`), `age`, and optional `pace|dribbling|passing|shooting` (0..1)
- Returns: `{ session_id, metrics, suggestions, similar_players }`
- `GET /sessions/:id` to fetch a past result.

## Run locally
```bash
npm install
npm start
# Server listens on http://localhost:3000
```

## Notes
- Analysis is mocked. Replace `analyzeVideoMock()` and `extractFeatures()` with real metrics.
- Pros dataset in `pros.json` (features length = 21). Update as needed.
- In production, store uploads in S3 or similar.
