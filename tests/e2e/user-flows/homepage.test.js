// tests/e2e/user-flows/homepage.test.js
describe('Homepage E2E Tests', () => {
  let browser;
  let page;

  beforeEach(async () => {
    browser = global.__BROWSER__;
    page = await browser.newPage();
  });

  afterEach(async () => {
    if (page) await page.close();
  });

  test('homepage loads successfully', async () => {
    await page.goto('http://localhost:3000');
    const title = await page.title();
    expect(title).toBeTruthy();
  });

  test('homepage has expected content', async () => {
    await page.goto('http://localhost:3000');
    // Adjust this selector based on your actual homepage
    const heading = await page.textContent('h1');
    expect(heading).toBeTruthy();
  });
});