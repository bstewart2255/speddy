import { test, expect } from '@playwright/test';

test.describe('00 - API Health Checks', () => {
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';
  
  test('server is running and responds to requests', async ({ request }) => {
    const response = await request.get(baseURL);
    expect(response.status()).toBe(200);
  });

  test('API route /api/health responds', async ({ request }) => {
    // Try a common health check endpoint
    const response = await request.get(`${baseURL}/api/health`);
    // Accept 200, 404, or 405 - we just want to know the server is responding
    expect([200, 404, 405]).toContain(response.status());
  });

  test('static assets are served', async ({ request }) => {
    // Next.js should have a favicon
    const response = await request.get(`${baseURL}/favicon.ico`);
    expect([200, 304]).toContain(response.status());
  });

  test('server returns proper headers', async ({ request }) => {
    const response = await request.get(baseURL);
    const headers = response.headers();
    
    // Should have some standard headers
    expect(headers).toHaveProperty('content-type');
    expect(headers['content-type']).toContain('text/html');
  });
});