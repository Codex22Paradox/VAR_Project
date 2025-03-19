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

const SEGMENT_DURATION = 10; // Durata di ogni segmento in secondi
const NUM_SEGMENTS = 6; // Numero di segmenti per coprire 60 secondi
const isWindows = process.platform === 'win32';

const VIDEO_DEVICE = process.env.VIDEO_DEVICE || (isWindows ? 'video=NomeDelTuoDispositivo' : '/dev/video0');
const OUTPUT_DIR = path.join(__dirname, 'recordings');
const TEMP_DIR = isWindows ? 'C:\\temp' : '/dev/shm';

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, {recursive: true});
if (isWindows && !fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

ffmpeg.setFfmpegPath(ffmpegStatic);

let segmentIndex = 0;
let segmentsRecorded = 0;
const segmentFiles = Array(NUM_SEGMENTS).fill(null).map((_, i) => path.join(TEMP_DIR, `segment_${i}.mp4`));

export const ffmpegModule = {
    startRecording: async function () {
        const recordSegment = (index) => {
            return new Promise((resolve, reject) => {
                ffmpeg()
                    .input(VIDEO_DEVICE)
                    .inputFormat(isWindows ? 'dshow' : 'v4l2')
                    .videoCodec('libx264')
                    .videoBitrate(8000)
                    .outputOptions(['-preset ultrafast', '-tune zerolatency', '-profile:v baseline', '-level 3.0', '-pix_fmt yuv420p'])
                    .duration(SEGMENT_DURATION)
                    .on('error', (err) => {
                        console.error('Errore nell\'avvio di FFmpeg:', err);
                        reject(err);
                    })
                    .on('end', () => {
                        console.log(`FFmpeg ha terminato la registrazione del segmento ${index}.`);
                        resolve();
                    })
                    .save(segmentFiles[index]);
            });
        };

        const recordLoop = async () => {
            while (true) {
                await recordSegment(segmentIndex);
                segmentIndex = (segmentIndex + 1) % NUM_SEGMENTS;
                segmentsRecorded++;
            }
        };

        recordLoop();
    }, saveLastMinute: async () => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputFile = path.join(OUTPUT_DIR, `recording-${timestamp}.mp4`);
        console.log(`Salvataggio dell'ultimo minuto in ${outputFile}...`);
        try {
            const filesToConcat = [];
            for (let i = 0; i < Math.min(NUM_SEGMENTS, segmentsRecorded); i++) {
                const index = (segmentIndex + i) % NUM_SEGMENTS;
                filesToConcat.push(segmentFiles[index]);
            }

            // Verifica che tutti i file esistano
            for (const file of filesToConcat) {
                if (!fs.existsSync(file)) {
                    throw new Error(`File non trovato: ${file}`);
                }
            }

            // Crea un file di testo con l'elenco dei file da concatenare
            const concatFilePath = path.join(TEMP_DIR, 'concat_list.txt');
            const concatFileContent = filesToConcat.map(file => `file '${file}'`).join('\n');
            await fsPromises.writeFile(concatFilePath, concatFileContent);

            await new Promise((resolve, reject) => {
                ffmpeg()
                    .input(concatFilePath)
                    .inputOptions('-f concat', '-safe 0')
                    .outputOptions('-c copy')
                    .on('error', (err) => {
                        console.error('Errore durante la concatenazione dei segmenti:', err);
                        reject(err);
                    })
                    .on('end', () => {
                        console.log('Concatenazione completata!');
                        resolve();
                    })
                    .save(outputFile);
            });

            console.log('Salvataggio completato!');
        } catch (err) {
            console.error('Errore durante il salvataggio del video:', err);
        }
    }
};