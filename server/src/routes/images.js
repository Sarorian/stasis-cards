import { Router } from 'express';
import Card from '../models/Card.js';
import { ah, HttpError } from '../util.js';

const r = Router();
const MAX_BYTES = 5 * 1024 * 1024;

/*
  GET /api/images?url=...  Loads a card picture through the server so the browser can draw it
  into a shareable PNG (pictures from other sites can't be exported from a canvas otherwise).
  Only pictures saved on one of our cards are allowed, so this can't fetch anything else.
*/
r.get('/', ah(async (req, res) => {
  const url = String(req.query.url || '');
  if (!/^https:\/\//i.test(url)) throw new HttpError(400, 'Only https picture links are supported.');
  if (!(await Card.exists({ imageUrl: url }))) throw new HttpError(404, 'That picture isn\'t on any card.');

  let upstream;
  try {
    upstream = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'follow' });
  } catch {
    throw new HttpError(502, 'Couldn\'t load the picture.');
  }
  const type = upstream.headers.get('content-type') || '';
  if (!upstream.ok || !type.startsWith('image/')) throw new HttpError(502, 'Couldn\'t load the picture.');
  const buf = Buffer.from(await upstream.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new HttpError(502, 'That picture is too big.');
  res.set('Content-Type', type);
  res.set('Cache-Control', 'private, max-age=86400');
  res.send(buf);
}));

export default r;
