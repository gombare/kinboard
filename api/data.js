// Vercel function for /api/data — see src/handler.js.
import { nodeAdapter } from '../src/handler.js';

export default function handler(req, res) {
  return nodeAdapter(req, res, '/api/data');
}
