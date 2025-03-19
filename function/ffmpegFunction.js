import ffmpeg from 'fluent-ffmpeg';
import {spawn} from 'child_process';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurazione
const SEGMENT_DURATION = 5; // Durata di ogni segmento in secondi
const MAX_SEGMENTS = 12; // 60 secondi totali (12 x 5s)
const OUTPUT_DIRECTORY = path.join(__dirname, '../recordings/temp');
const FINAL_OUTPUT_DIRECTORY = path.join(__dirname, '../recordings/saved');

// Creazione delle directory se non esistono
if (!fs.existsSync(OUTPUT_DIRECTORY)) {
    fs.mkdirSync(OUTPUT_DIRECTORY, {recursive: true});
}
if (!fs.existsSync(FINAL_OUTPUT_DIRECTORY)) {
    fs.mkdirSync(FINAL_OUTPUT_DIRECTORY, {recursive: true});
}

class FFmpegModule {
    constructor() {
        this.segments = [];
        this.currentProcess = null;
        this.isRecording = false;
        this.currentSegmentIndex = 0;
    }

    async startRecording() {
        if (this.isRecording) return;
        this.isRecording = true;

        // Pulizia dei segmenti temporanei residui
        await this.cleanTempDirectory();

        this.recordSegment();
    }

    async cleanTempDirectory() {
        const files = fs.readdirSync(OUTPUT_DIRECTORY);
        for (const file of files) {
            fs.unlinkSync(path.join(OUTPUT_DIRECTORY, file));
        }
    }

    recordSegment() {
        if (!this.isRecording) return;

        const segmentPath = path.join(OUTPUT_DIRECTORY, `segment_${this.currentSegmentIndex}.mp4`);

        // Parametri migliorati per fluidità
        const args = [
            '-f', 'gdigrab',
            '-framerate', '30',
            '-video_size', '1920x1080',
            '-i', 'desktop',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-crf', '23',
            '-pix_fmt', 'yuv420p',
            '-t', SEGMENT_DURATION.toString(),
            segmentPath
        ];

        this.currentProcess = spawn('ffmpeg', args, {shell: true});

        this.currentProcess.on('close', (code) => {
            if (code === 0 && this.isRecording) {
                // Aggiungiamo il nuovo segmento
                this.segments.push({
                    path: segmentPath,
                    index: this.currentSegmentIndex
                });

                // Manteniamo solo gli ultimi MAX_SEGMENTS (60 secondi)
                if (this.segments.length > MAX_SEGMENTS) {
                    const oldestSegment = this.segments.shift();
                    try {
                        fs.unlinkSync(oldestSegment.path);
                    } catch (err) {
                        console.error(`Errore nell'eliminazione del segmento: ${err.message}`);
                    }
                }

                this.currentSegmentIndex++;
                this.recordSegment();
            } else if (this.isRecording) {
                console.error(`FFmpeg terminato con codice ${code}. Riavvio...`);
                setTimeout(() => this.recordSegment(), 1000);
            }
        });
    }

    async stopRecording() {
        this.isRecording = false;
        if (this.currentProcess) {
            this.currentProcess.kill('SIGTERM');
            this.currentProcess = null;
        }
    }

    async saveLastMinute() {
        const wasRecording = this.isRecording;
        await this.stopRecording();

        if (this.segments.length === 0) {
            if (wasRecording) this.startRecording();
            throw new Error('Nessun segmento disponibile');
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputFile = path.join(FINAL_OUTPUT_DIRECTORY, `recording_${timestamp}.mp4`);

        // File di lista per concatenazione
        const segmentListFile = path.join(OUTPUT_DIRECTORY, 'segmentlist.txt');
        let listContent = '';

        // Ordinamento cronologico dei segmenti
        const orderedSegments = [...this.segments].sort((a, b) => a.index - b.index);

        for (const segment of orderedSegments) {
            if (fs.existsSync(segment.path)) {
                listContent += `file '${segment.path.replace(/\\/g, '/')}'\n`;
            }
        }

        fs.writeFileSync(segmentListFile, listContent);

        return new Promise((resolve, reject) => {
            ffmpeg()
                .input(segmentListFile)
                .inputOptions(['-f', 'concat', '-safe', '0'])
                .outputOptions([
                    '-c', 'copy',
                    '-movflags', '+faststart'
                ])
                .output(outputFile)
                .on('end', () => {
                    try {
                        fs.unlinkSync(segmentListFile);
                    } catch (err) {
                        console.warn(`Errore eliminando il file lista: ${err.message}`);
                    }

                    if (wasRecording) this.startRecording();
                    resolve(outputFile);
                })
                .on('error', (err) => {
                    if (wasRecording) this.startRecording();
                    reject(err);
                })
                .run();
        });
    }
}

export const ffmpegModule = new FFmpegModule();