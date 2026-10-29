// Vercel function for /api/dose — see src/handler.js.
import { nodeAdapter } from '../src/handler.js';

export default function handler(req, res) {
  return nodeAdapter(req, res, '/api/dose');
}
