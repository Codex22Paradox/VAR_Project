import {createRequire} from "module";

const require = createRequire(import.meta.url);
const express = require('express');
const {ffmpegModule} = require('./function/ffmpegFunction');
const app = express();
const port = 3000;

// Avvia la registrazione quando il server si avvia

await ffmpegModule.startRecording();

app.get('/save-last-minute', async (req, res) => {
    try {
        await ffmpegModule.saveLastMinute();
        res.status(200).json({message: 'Salvataggio dell\'ultimo minuto completato.'});
    } catch (err) {
        res.status(500).json({message: 'Errore durante il salvataggio dell\'ultimo minuto.', error: err.message});
    }
});

app.listen(port, () => {
    console.log(`Server in ascolto su http://localhost:${port}`);
});