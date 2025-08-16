import { test, expect } from '@playwright/test';

test.describe('Kindergarten Schedule Toggle', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the bell schedules page
    // Assuming user is already authenticated in test setup
    await page.goto('/dashboard/bell-schedules');
    await page.waitForLoadState('networkidle');
  });

  test('should default to unchecked for kindergarten schedule', async ({ page }) => {
    // Wait for the form to load
    await page.waitForSelector('form', { timeout: 10000 });
    
    // Find the kindergarten checkbox by looking for the label that contains the text
    const kindergartenCheckbox = page.locator('label:has-text("Different schedule for Kindergarten") input[type="checkbox"]');
    await expect(kindergartenCheckbox).not.toBeChecked();
  });

  test('should show kindergarten schedule fields when checkbox is checked', async ({ page }) => {
    // Wait for the form to load
    await page.waitForSelector('form', { timeout: 10000 });
    
    // Find and check the kindergarten checkbox
    const kindergartenCheckbox = page.locator('label:has-text("Different schedule for Kindergarten") input[type="checkbox"]');
    await kindergartenCheckbox.click();

    // Verify that the kindergarten schedule fields appear
    await expect(page.locator('text="Kindergarten Hours (All Day)"')).toBeVisible();
    
    // Verify AM/PM schedule options are available
    await expect(page.locator('text="Separate AM schedule"')).toBeVisible();
    await expect(page.locator('text="Separate PM schedule"')).toBeVisible();
  });

  test('should save kindergarten schedule only when checkbox is checked', async ({ page }) => {
    // Wait for the form to load
    await page.waitForSelector('form', { timeout: 10000 });
    
    // Check the kindergarten checkbox
    const kindergartenCheckbox = page.locator('label:has-text("Different schedule for Kindergarten") input[type="checkbox"]');
    await kindergartenCheckbox.click();

    // Fill in some kindergarten schedule times
    const kScheduleSection = page.locator('div').filter({ hasText: 'Kindergarten Hours (All Day)' }).first();
    
    // Set Monday start time to 8:30 AM
    const mondayStartSelect = kScheduleSection.locator('select').first();
    await mondayStartSelect.selectOption('08:30');

    // Set Monday end time to 2:30 PM
    const mondayEndSelect = kScheduleSection.locator('select').nth(1);
    await mondayEndSelect.selectOption('14:30');

    // Save the form
    await page.locator('button').filter({ hasText: 'Save School Hours' }).click();

    // Wait for save to complete
    await page.waitForResponse(response => 
      response.url().includes('school_hours') && response.status() === 200
    );

    // Reload the page to verify data was saved
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify the checkbox is still checked
    const reloadedCheckbox = page.locator('label:has-text("Different schedule for Kindergarten") input[type="checkbox"]');
    await expect(reloadedCheckbox).toBeChecked();

    // Verify the saved times are displayed
    const reloadedKSection = page.locator('div').filter({ hasText: 'Kindergarten Hours (All Day)' }).first();
    const reloadedMondayStart = reloadedKSection.locator('select').first();
    await expect(reloadedMondayStart).toHaveValue('08:30');
  });

  test('should delete kindergarten schedules when checkbox is unchecked', async ({ page }) => {
    // Wait for the form to load
    await page.waitForSelector('form', { timeout: 10000 });
    
    // First, set up a kindergarten schedule
    const kindergartenCheckbox = page.locator('label:has-text("Different schedule for Kindergarten") input[type="checkbox"]');
    await kindergartenCheckbox.click();

    // Wait for kindergarten schedule fields to appear
    await expect(page.locator('text="Kindergarten Hours (All Day)"')).toBeVisible();

    // Fill in kindergarten schedule
    const kScheduleSection = page.locator('div').filter({ hasText: 'Kindergarten Hours (All Day)' }).first();
    const mondayStartSelect = kScheduleSection.locator('select').first();
    await mondayStartSelect.selectOption('08:30');
    const mondayEndSelect = kScheduleSection.locator('select').nth(1);
    await mondayEndSelect.selectOption('14:30');

    // Save
    await page.locator('button').filter({ hasText: 'Save School Hours' }).click();
    await page.waitForResponse(response => 
      response.url().includes('school_hours') && response.status() === 200
    );

    // Now uncheck the kindergarten checkbox
    await kindergartenCheckbox.click();

    // Wait for kindergarten schedule fields to disappear
    await expect(page.locator('text="Kindergarten Hours (All Day)"')).not.toBeVisible();

    // Save again
    await page.locator('button').filter({ hasText: 'Save School Hours' }).click();
    await page.waitForResponse(response => 
      response.url().includes('school_hours') && response.status() === 200
    );

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify the checkbox is unchecked
    const reloadedCheckbox = page.locator('label:has-text("Different schedule for Kindergarten") input[type="checkbox"]');
    await expect(reloadedCheckbox).not.toBeChecked();

    // Verify kindergarten schedule fields are not visible
    await expect(page.locator('text="Kindergarten Hours (All Day)"')).not.toBeVisible();
  });

  test('should handle K-AM and K-PM schedules correctly', async ({ page }) => {
    // Wait for the form to load
    await page.waitForSelector('form', { timeout: 10000 });
    
    // Check the kindergarten checkbox
    const kindergartenCheckbox = page.locator('label:has-text("Different schedule for Kindergarten") input[type="checkbox"]');
    await kindergartenCheckbox.click();

    // Wait for kindergarten schedule fields to appear
    await expect(page.locator('text="Kindergarten Hours (All Day)"')).toBeVisible();

    // Check the AM schedule checkbox using accessible role selector
    const amCheckbox = page.getByRole('checkbox', { name: 'Separate AM schedule' });
    await expect(amCheckbox).toBeVisible({ timeout: 2000 });
    await amCheckbox.click();

    // Verify AM schedule fields appear
    await expect(page.locator('text="Kindergarten AM Hours"')).toBeVisible();

    // Fill in AM schedule
    const amSection = page.locator('div').filter({ hasText: 'Kindergarten AM Hours' }).first();
    const amMondayStart = amSection.locator('select').first();
    await amMondayStart.selectOption('08:00');
    const amMondayEnd = amSection.locator('select').nth(1);
    await amMondayEnd.selectOption('11:30');

    // Check the PM schedule checkbox using accessible role selector
    const pmCheckbox = page.getByRole('checkbox', { name: 'Separate PM schedule' });
    await expect(pmCheckbox).toBeVisible({ timeout: 2000 });
    await pmCheckbox.click();

    // Verify PM schedule fields appear
    await expect(page.locator('text="Kindergarten PM Hours"')).toBeVisible();

    // Fill in PM schedule
    const pmSection = page.locator('div').filter({ hasText: 'Kindergarten PM Hours' }).first();
    const pmMondayStart = pmSection.locator('select').first();
    await pmMondayStart.selectOption('12:00');
    const pmMondayEnd = pmSection.locator('select').nth(1);
    await pmMondayEnd.selectOption('15:00');

    // Save
    await page.locator('button').filter({ hasText: 'Save School Hours' }).click();
    await page.waitForResponse(response => 
      response.url().includes('school_hours') && response.status() === 200
    );

    // Reload and verify all schedules are saved
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify checkboxes are checked
    await expect(page.locator('label:has-text("Different schedule for Kindergarten") input[type="checkbox"]')).toBeChecked();
    
    // Verify AM/PM checkboxes are checked using accessible role selectors
    await expect(page.getByRole('checkbox', { name: 'Separate AM schedule' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Separate PM schedule' })).toBeChecked();

    // Verify saved times
    const reloadedAmSection = page.locator('div').filter({ hasText: 'Kindergarten AM Hours' }).first();
    await expect(reloadedAmSection.locator('select').first()).toHaveValue('08:00');
    
    const reloadedPmSection = page.locator('div').filter({ hasText: 'Kindergarten PM Hours' }).first();
    await expect(reloadedPmSection.locator('select').first()).toHaveValue('12:00');
  });
});