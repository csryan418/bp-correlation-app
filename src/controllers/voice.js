import https from 'https';
import { Readable } from 'stream';

export async function transcribe(req, res) {
  if (!req.file) return res.status(400).json({ error: 'audio file required' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });

  const boundary = `----FormBoundary${Date.now()}`;
  const filename = req.file.originalname || 'audio.webm';

  const preamble = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${req.file.mimetype || 'audio/webm'}\r\n\r\n`
  );
  const modelPart = Buffer.from(
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nen\r\n--${boundary}--\r\n`
  );
  const body = Buffer.concat([preamble, req.file.buffer, modelPart]);

  const options = {
    hostname: 'api.openai.com',
    path: '/v1/audio/transcriptions',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
    },
  };

  const request = https.request(options, (response) => {
    let data = '';
    response.on('data', chunk => { data += chunk; });
    response.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (response.statusCode !== 200) {
          return res.status(502).json({ error: 'Whisper API error', detail: json.error?.message });
        }
        res.json({ transcript: json.text ?? '' });
      } catch {
        res.status(502).json({ error: 'Invalid response from Whisper API' });
      }
    });
  });

  request.on('error', (err) => {
    res.status(502).json({ error: 'Failed to reach Whisper API', detail: err.message });
  });

  const readable = Readable.from(body);
  readable.pipe(request);
}
