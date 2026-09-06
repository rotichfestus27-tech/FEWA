const express = require('express');

const app = express();
app.use(express.json());

// Minimal server: health endpoint only. Authentication and Firestore are handled by the client using Firebase.
app.get('/api/health', (req, res) => res.json({ status: 'ok', message: 'FEWA server running (no auth endpoints).' }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`FEWA server running on http://localhost:${PORT}`));
