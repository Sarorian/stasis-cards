import mongoose from 'mongoose';
import Show from './models/Show.js';
import { HttpError } from './util.js';

/*
  Where a buy or sale happened: a show's id, 'private' (private sale) or 'ebay'.
  Blank = not set (older records). Unknown values are refused.
*/
export const WHERE_OTHER = ['private', 'ebay'];

export async function checkAt(at) {
  if (at === undefined || at === null || at === '') return null;
  const v = String(at);
  if (WHERE_OTHER.includes(v)) return v;
  if (mongoose.isValidObjectId(v) && (await Show.exists({ _id: v }))) return v;
  throw new HttpError(400, 'Pick where this happened: a show, Private sale or eBay.');
}

// Schema field for models
export const atField = { type: String, default: null };
