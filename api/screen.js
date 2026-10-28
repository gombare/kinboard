// Vercel function for /api/screen — see src/handler.js.
import { nodeAdapter } from '../src/handler.js';

export default function handler(req, res) {
  return nodeAdapter(req, res, '/api/screen');
}
