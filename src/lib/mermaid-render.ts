import path from 'path';
import fs from 'fs';
import https from 'https';

const DIAGRAMS_DIR = path.join(process.cwd(), 'data', 'diagrams');

function ensureDiagramsDir() {
  if (!fs.existsSync(DIAGRAMS_DIR)) {
    fs.mkdirSync(DIAGRAMS_DIR, { recursive: true });
  }
}

// Uses mermaid.ink to render diagram to PNG and saves locally
export async function renderMermaidToImage(
  mermaidCode: string,
  filename: string
): Promise<string> {
  ensureDiagramsDir();
  const outputPath = path.join(DIAGRAMS_DIR, `${filename}.png`);
  const publicPath = `/diagrams/${filename}.png`;

  // Encode the mermaid code for mermaid.ink API
  const encoded = Buffer.from(mermaidCode, 'utf8').toString('base64url');
  const url = `https://mermaid.ink/img/${encoded}?bgColor=white`;

  await downloadFile(url, outputPath);
  return publicPath;
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location!;
        file.close();
        fs.unlinkSync(dest);
        downloadFile(redirectUrl, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', (err) => { fs.unlinkSync(dest); reject(err); });
    }).on('error', (err) => { fs.unlinkSync(dest); reject(err); });
  });
}

export function getMermaidImagePath(storyId: string): string {
  return path.join(DIAGRAMS_DIR, `${storyId}.png`);
}

export function diagramExists(storyId: string): boolean {
  return fs.existsSync(getMermaidImagePath(storyId));
}
