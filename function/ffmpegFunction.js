import {createRequire} from "module";
import {fileURLToPath} from 'url';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';

const require = createRequire(import.meta.url);
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUFFER_DURATION = 60; // Buffer di 60 secondi
const isWindows = process.platform === 'win32';

// Imposta il nome del dispositivo dinamicamente per avviare il programma devo:
const VIDEO_DEVICE = process.env.VIDEO_DEVICE || (isWindows ? 'video=NomeDelTuoDispositivo' : '/dev/video0');
const OUTPUT_DIR = path.join(__dirname, 'recordings');
const BUFFER_FILE = isWindows ? 'C:\\temp\\video_buffer.mp4' : '/dev/shm/video_buffer.mp4';

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, {recursive: true});

if (isWindows && !fs.existsSync('C:\\temp')) fs.mkdirSync('C:\\temp');

ffmpeg.setFfmpegPath(ffmpegStatic);

export const ffmpegModule = {
    startRecording: async function () {
        try {
            await new Promise((resolve, reject) => {
                ffmpeg()
                    .input(VIDEO_DEVICE)
                    .inputFormat(isWindows ? 'dshow' : 'v4l2')
                    .videoCodec('libx264')
                    .videoBitrate(8000) // Bitrate impostato a 8 Mbps
                    .outputOptions(['-preset veryfast', '-tune zerolatency', '-pix_fmt yuv420p', '-crf 23'])
                    .duration(BUFFER_DURATION)
                    .on('error', (err) => {
                        console.error('Errore nell\'avvio di FFmpeg:', err);
                        reject(err);
                    })
                    .on('end', () => {
                        console.log('FFmpeg ha terminato la registrazione nel buffer.');
                        resolve();
                    })
                    .save(BUFFER_FILE);
            });

            console.log(`FFmpeg sta registrando in RAM con dispositivo: ${VIDEO_DEVICE}`);
        } catch (err) {
            console.error('Errore durante la registrazione:', err);
        }
    },

    saveLastMinute: async () => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputFile = path.join(OUTPUT_DIR, `recording-${timestamp}.mp4`);
        console.log(`Salvataggio dell'ultimo minuto in ${outputFile}...`);
        try {
            await fsPromises.copyFile(BUFFER_FILE, outputFile);
            console.log('Salvataggio completato!');
        } catch (err) {
            console.error('Errore durante il salvataggio del video:', err);
        }
    }
};