/**
 * SPE-398 · OneRoster pagination, and its refusal to truncate quietly.
 *
 * A single large `limit` is not a substitute for paging: servers cap it
 * silently, so a district bigger than the guess comes back short with no
 * indication. That matters more here than usual — a truncated roster makes the
 * DISTRICT's data look incomplete in the match-rate report, when the loss was
 * entirely ours.
 */
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { OneRosterClient } from '@/lib/integrations/oneroster';

let server: Server;
let origin: string;
/** How many rows the fake server holds, and how many it will serve per page. */
let total = 0;
let serverCap = 1000;
let requests: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '', 'http://x');
    requests.push(url.pathname + url.search);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (url.pathname.includes('/token')) return res.end(JSON.stringify({ access_token: 't' }));

    const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), serverCap);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const users = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => ({
      sourcedId: `u-${offset + i}`,
    }));
    res.end(JSON.stringify({ users }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });
beforeEach(() => { requests = []; serverCap = 1000; });

const client = () =>
  new OneRosterClient({
    baseUrl: `${origin}/admin`,
    tokenUrl: `${origin}/admin/token`,
    clientId: 'id',
    clientSecret: 'secret',
  });

it('walks past the first page to collect the whole collection', async () => {
  total = 2500;
  const rows = await client().getAllPages<{ sourcedId: string }>('students', 'users');
  expect(rows).toHaveLength(2500);
  // Distinct rows, not the first page fetched three times — an `offset` the
  // client failed to send would still produce 2500 with only 1000 real students.
  expect(new Set(rows.map((r) => r.sourcedId)).size).toBe(2500);
});

it('stops as soon as a page comes back short', async () => {
  total = 10;
  const rows = await client().getAllPages<{ sourcedId: string }>('students', 'users');
  expect(rows).toHaveLength(10);
  expect(requests.filter((r) => r.includes('/students'))).toHaveLength(1);
});

it('returns an empty collection without looping', async () => {
  total = 0;
  await expect(client().getAllPages('students', 'users')).resolves.toEqual([]);
  expect(requests.filter((r) => r.includes('/students'))).toHaveLength(1);
});

it('THROWS rather than returning a silently truncated collection', async () => {
  // A server that ignores `offset` — every page comes back full, so the walk
  // never terminates on its own. Returning what it had would look like a
  // complete roster and quietly wreck the match rate.
  total = Number.MAX_SAFE_INTEGER;
  serverCap = 1000;
  await expect(client().getAllPages('students', 'users')).rejects.toThrow(/truncated/i);
}, 60_000);
