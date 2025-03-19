import express from 'express';
import http from 'http';
import { fileURLToPath } from 'url';
import path from 'path';
import bodyParser from 'body-parser';
import { ffmpegModule } from './function/ffmpegFunction.js';

const app = express();
const port = 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(bodyParser.json());
app.use(
    bodyParser.urlencoded({
        extended: true,
    })
);
app.use("/", express.static(path.join(__dirname, "public")));

// Avvia la registrazione in background quando il server si avvia
ffmpegModule.startRecording();

app.get('/save-last-minute', async (req, res) => {
    try {
        await ffmpegModule.saveLastMinute();
        res.status(200).json({ message: 'Salvataggio dell\'ultimo minuto completato.' });
    } catch (err) {
        res.status(500).json({ message: 'Errore durante il salvataggio dell\'ultimo minuto.', error: err.message });
    }
});

app.listen(port, () => {
    console.log(`Server in ascolto su http://localhost:${port}`);
});