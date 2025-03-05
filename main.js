const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');

const BUFFER_DURATION = 60; // Buffer di 60 secondi
const isWindows = process.platform === 'win32';

// Imposta il nome del dispositivo dinamicamente per avviare il programma devo:
const VIDEO_DEVICE = process.env.VIDEO_DEVICE || (isWindows ? 'video=USB Video Device' : '/dev/video0');
const OUTPUT_DIR = path.join(__dirname, 'recordings');
const BUFFER_FILE = isWindows ? 'C:\\temp\\video_buffer.mp4' : '/dev/shm/video_buffer.mp4';

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, {recursive: true});
}
if (isWindows && !fs.existsSync('C:\\temp')) {
    fs.mkdirSync('C:\\temp');
}

ffmpeg.setFfmpegPath(ffmpegStatic);

//Buffer in RAM per massima ottimizzazione
const ffmpegProcess = ffmpeg()
    .input(VIDEO_DEVICE)
    .inputFormat(isWindows ? 'dshow' : 'v4l2')
    .videoCodec('libx264')
    .videoBitrate(8000) // Bitrate impostato a 8 Mbps
    .outputOptions('-preset ultrafast')
    .duration(BUFFER_DURATION)
    .on('error', (err) => {
        console.error('Errore nell\'avvio di FFmpeg:', err);
    })
    .on('end', () => {
        console.log('FFmpeg ha terminato la registrazione nel buffer.');
    })
    .save(BUFFER_FILE);

console.log(`FFmpeg sta registrando in RAM con dispositivo: ${VIDEO_DEVICE}`);

function saveLastMinute() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = path.join(OUTPUT_DIR, `recording-${timestamp}.mp4`);

    console.log(`Salvataggio dell'ultimo minuto in ${outputFile}...`);
    fs.copyFile(BUFFER_FILE, outputFile, (err) => {
        if (err) {
            console.error('Errore durante il salvataggio del video:', err);
        } else {
            console.log('Salvataggio completato!');
        }
    });
}

