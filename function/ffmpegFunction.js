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
const SEGMENT_DURATION = 2; // Ogni segmento dura 2 secondi
const SEGMENTS_COUNT = Math.ceil(BUFFER_DURATION / SEGMENT_DURATION);
const isWindows = process.platform === 'win32';

// Imposta il nome del dispositivo dinamicamente
const VIDEO_DEVICE = process.env.VIDEO_DEVICE || (isWindows ? 'video=NomeDelTuoDispositivo' : '/dev/video0');
const OUTPUT_DIR = path.join(__dirname, '../recordings');
const BUFFER_DIR = isWindows ? 'C:\\temp\\buffer' : '/dev/shm/buffer';
const SEGMENT_PATTERN = path.join(BUFFER_DIR, 'segment%03d.mp4');

// Assicurati che le directory necessarie esistano
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, {recursive: true});
if (!fs.existsSync(BUFFER_DIR)) fs.mkdirSync(BUFFER_DIR, {recursive: true});

ffmpeg.setFfmpegPath(ffmpegStatic);

let ffmpegProcess = null;
let isRecording = false;

export const ffmpegModule = {
    startRecording: async function () {
        if (isRecording) {
            console.log('La registrazione è già in corso.');
            return;
        }

        try {
            // Pulisci i vecchi segmenti se presenti
            const files = await fsPromises.readdir(BUFFER_DIR).catch(() => []);
            for (const file of files) {
                if (file.startsWith('segment')) {
                    await fsPromises.unlink(path.join(BUFFER_DIR, file)).catch(() => {
                    });
                }
            }

            // Avvia la registrazione continua con segmenti
            return new Promise((resolve, reject) => {
                const process = ffmpeg()
                    .input(VIDEO_DEVICE)
                    .inputFormat(isWindows ? 'dshow' : 'v4l2')
                    .videoCodec('libx264')
                    .videoBitrate(8000)
                    .outputOptions([
                        '-preset ultrafast',
                        '-tune zerolatency',
                        '-profile:v baseline',
                        '-level 3.0',
                        '-pix_fmt yuv420p',
                        '-f segment',
                        `-segment_time ${SEGMENT_DURATION}`,
                        `-segment_wrap ${SEGMENTS_COUNT}`,
                        '-reset_timestamps 1'
                    ])
                    .on('start', (commandLine) => {
                        console.log(`FFmpeg sta registrando in segmenti con dispositivo: ${VIDEO_DEVICE}`);
                        ffmpegProcess = process;
                        isRecording = true;
                        resolve();
                    })
                    .on('error', (err) => {
                        if (err && err.message && err.message.includes('SIGKILL')) {
                            console.log('FFmpeg process terminated');
                        } else {
                            console.error('Errore in FFmpeg:', err);
                            isRecording = false;
                            ffmpegProcess = null;
                            reject(err);
                        }
                    })
                    .save(SEGMENT_PATTERN);
            });
        } catch (err) {
            console.error('Errore durante l\'avvio della registrazione:', err);
            isRecording = false;
            throw err;
        }
    },

    saveLastMinute: async () => {
        if (!isRecording) {
            throw new Error('Registrazione non attiva. Avviare prima la registrazione.');
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputFile = path.join(OUTPUT_DIR, `recording-${timestamp}.mp4`);
        const listFile = path.join(BUFFER_DIR, 'filelist.txt');

        try {
            // Trova tutti i segmenti e ordinali
            const files = await fsPromises.readdir(BUFFER_DIR);
            const segments = files
                .filter(file => file.startsWith('segment') && file.endsWith('.mp4'))
                .sort((a, b) => {
                    // Estrai i numeri e confrontali
                    const numA = parseInt(a.match(/segment(\d+)\.mp4/)[1]);
                    const numB = parseInt(b.match(/segment(\d+)\.mp4/)[1]);
                    return numA - numB;
                });

            if (segments.length === 0) {
                throw new Error('Nessun segmento disponibile per il salvataggio');
            }

            console.log(`Trovati ${segments.length} segmenti da unire`);

            // Crea un file di lista per la concatenazione
            const fileContent = segments.map(file =>
                `file '${path.join(BUFFER_DIR, file).replace(/\\/g, '/')}'`
            ).join('\n');

            await fsPromises.writeFile(listFile, fileContent);

            // Concatena i segmenti in un unico file
            await new Promise((resolve, reject) => {
                ffmpeg()
                    .input(listFile)
                    .inputOptions(['-f concat', '-safe 0'])
                    .outputOptions('-c copy')
                    .on('end', resolve)
                    .on('error', reject)
                    .save(outputFile);
            });

            console.log(`Salvataggio completato in ${outputFile}!`);
            return outputFile;
        } catch (err) {
            console.error('Errore durante il salvataggio del video:', err);
            throw err;
        } finally {
            // Pulizia del file di lista
            if (fs.existsSync(listFile)) {
                await fsPromises.unlink(listFile).catch(() => {
                });
            }
        }
    },

    stopRecording: async () => {
        if (ffmpegProcess) {
            ffmpegProcess.kill('SIGKILL');
            ffmpegProcess = null;
            isRecording = false;
            console.log('Registrazione interrotta.');
        } else {
            console.log('Nessuna registrazione attiva da interrompere.');
        }
    }
};

// Gestione della terminazione pulita
process.on('exit', () => {
    if (ffmpegProcess) {
        ffmpegProcess.kill('SIGKILL');
    }
});

// Gestione di segnali di terminazione
['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
    process.on(signal, () => {
        if (ffmpegProcess) {
            ffmpegProcess.kill('SIGKILL');
        }
        process.exit(0);
    });
});