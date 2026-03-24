# RafQR - Quick File Transfer

Transfer files from PC to Mobile instantly via QR Code. Files are stored temporarily and automatically expire after 30 minutes.

## Features

- 🚀 **Fast Transfer**: Direct upload to Firebase Storage (client-side)
- 📱 **QR Code Download**: Scan and download on mobile instantly
- ⏱️ **Auto-Expiry**: Files automatically expire after 30 minutes
- 🔒 **Secure**: No registration required, files are deleted automatically
- 🎨 **Modern UI**: Beautiful gradient design with Tailwind CSS

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS
- **Storage**: Firebase Storage
- **Database**: Upstash Redis (for session management)
- **QR Code**: qrcode.react
- **ID Generation**: nanoid

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Firebase project with Storage enabled
- Upstash Redis account

### Installation

1. **Clone the repository** (or use existing files)

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:

   Copy `.env.local.example` to `.env.local` and fill in your credentials:
   ```bash
   cp .env.local.example .env.local
   ```

4. **Configure Firebase**:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Create a new project or use existing one
   - Enable Firebase Storage
   - Get your Firebase config from Project Settings
   - Fill in the Firebase environment variables

5. **Configure Upstash Redis**:
   - Go to [Upstash](https://upstash.com/)
   - Create a new Redis database
   - Copy the REST URL and Token
   - Fill in the Upstash environment variables

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

## Project Structure

```
RafQR/
├── app/
│   ├── api/
│   │   └── session/
│   │       └── route.ts      # API for session management
│   ├── d/
│   │   └── [id]/
│   │       └── page.tsx      # Download page (mobile view)
│   ├── globals.css           # Global styles
│   ├── layout.tsx            # Root layout
│   └── page.tsx              # Upload page (PC view)
├── lib/
│   ├── firebase.ts           # Firebase configuration & utilities
│   └── redis.ts              # Redis configuration & utilities
├── components/               # Reusable components (optional)
├── .env.local.example        # Environment variables template
└── package.json
```

## How It Works

### Upload Flow (PC)
1. User drags & drops or selects a file
2. File is uploaded directly to Firebase Storage (client-side)
3. Progress bar shows real-time upload status
4. After upload, a session is created in Redis with 30min TTL
5. QR code is generated with the download URL

### Download Flow (Mobile)
1. User scans QR code and opens the download page
2. Page fetches file info from Redis session
3. User clicks download button
4. File is downloaded from Firebase Storage
5. Session TTL is extended on each access

## API Endpoints

### `POST /api/session`
Create a new file session.

**Request Body**:
```json
{
  "fileName": "example.pdf",
  "fileSize": 1024000,
  "fileType": "application/pdf",
  "firebaseUrl": "https://firebasestorage.googleapis.com/...",
  "storageRef": "uploads/1234567890_example.pdf"
}
```

**Response**:
```json
{
  "success": true,
  "uniqueId": "abc123xyz",
  "message": "Session created successfully"
}
```

### `GET /api/session?id=uniqueId`
Get file session data.

**Response**:
```json
{
  "success": true,
  "data": {
    "fileName": "example.pdf",
    "fileSize": 1024000,
    "fileType": "application/pdf",
    "firebaseUrl": "https://firebasestorage.googleapis.com/...",
    "storageRef": "uploads/1234567890_example.pdf",
    "createdAt": 1711296000
  }
}
```

## Redis Schema

```
Key: file:{uniqueId}
Value: {
  "fileName": "example.pdf",
  "fileSize": 1024000,
  "fileType": "application/pdf",
  "firebaseUrl": "https://...",
  "storageRef": "uploads/1234567890_example.pdf",
  "createdAt": 1711296000
}
TTL: 1800 seconds (30 minutes)
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase API Key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Storage Bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase Messaging Sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase App ID |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis Token |
| `NEXT_PUBLIC_APP_URL` | Your app URL (for QR codes) |

## License

MIT

## Author

RafQR - Built with ❤️ using Next.js, Firebase, and Redis
