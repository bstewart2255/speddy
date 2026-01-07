# Speddy - SEIS Data Bridge

Chrome extension to import IEP data from SEIS directly into your Speddy account.

## Features

- Extract IEP goals from SEIS Goals Summary page
- Extract services (sessions/week, minutes/session) from Services page
- Extract accommodations from Services page
- Automatically sync data to your Speddy account

## Installation (Development)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `speddy-chrome-extension` folder

## Usage

1. **Generate an API Key**
   - Go to Speddy → Settings → API Keys
   - Click "Generate New API Key"
   - Copy the key (it's only shown once!)

2. **Configure the Extension**
   - Click the Speddy extension icon in Chrome
   - Paste your API key and save

3. **Import Data from SEIS**
   - Log into SEIS (seis.org)
   - Navigate to a student's Goals or Services page
   - Click the Speddy extension icon
   - Click "Extract & Import to Speddy"

## Supported SEIS Pages

| Page | URL Pattern | Data Extracted |
|------|-------------|----------------|
| Student List | `/iep/` | Student names, IDs (for navigation) |
| Goals Summary | `/forms/{id}/state/goals2/a` | IEP goals, student info, IEP dates |
| Services | `/forms/{id}/state/services/fape3` | Services, accommodations |

## Development

### Project Structure

```
speddy-chrome-extension/
├── manifest.json           # Extension configuration
├── service-worker.js       # Background service worker
├── content-scripts/
│   └── seis.js             # SEIS page scraper
├── popup/
│   ├── popup.html          # Extension popup UI
│   ├── popup.css           # Popup styles
│   └── popup.js            # Popup logic
├── lib/
│   └── speddy-api.js       # API client
└── icons/
    ├── icon-16.png         # Toolbar icon
    ├── icon-48.png         # Extension management
    └── icon-128.png        # Chrome Web Store
```

### Building Icons

Icons should be PNG files at 16x16, 48x48, and 128x128 pixels.

For development, you can use placeholder icons or create them with:
- Figma
- Adobe Illustrator
- Online icon generators

### Testing

1. Load the unpacked extension in Chrome
2. Navigate to SEIS and log in
3. Go to a student's Goals or Services page
4. Open DevTools (F12) and check the Console for logs
5. Click the extension icon and test extraction

### Debugging

- **Content Script**: Check the page's DevTools console
- **Service Worker**: Go to `chrome://extensions/`, find Speddy, click "Service worker"
- **Popup**: Right-click the extension icon → Inspect popup

## API Endpoints

The extension communicates with Speddy via:

- `POST /api/extension/import` - Import extracted SEIS data
  - Header: `Authorization: Bearer sk_live_...`
  - Body: JSON with student data

## Security

- API keys are stored locally in Chrome storage
- Keys are hashed (SHA-256) on the server - full key is never stored
- Data is transmitted over HTTPS
- PII is scrubbed from IEP goals before storage

## Publishing

To publish to Chrome Web Store (unlisted):

1. Create icons (16, 48, 128 px)
2. Zip the extension folder
3. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
4. Pay $5 one-time developer fee
5. Upload the zip file
6. Set visibility to "Unlisted"
7. Submit for review
