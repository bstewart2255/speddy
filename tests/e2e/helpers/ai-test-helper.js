// tests/e2e/helpers/ai-test-helper.js
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

export class AITestHelper {
  constructor(page) {
    this.page = page;
  }

  // Analyze page content and suggest what to test
  async analyzePageContent() {
    const pageContent = await this.page.content();
    const pageTitle = await this.page.title();
    const url = this.page.url();

    const message = await anthropic.messages.create({
      model: "claude-3-opus-20240229",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: `You are a QA expert. Analyze this page and identify critical user flows to test.

          URL: ${url}
          Title: ${pageTitle}
          HTML (first 2000 chars): ${pageContent.substring(0, 2000)}

          Return a JSON array of test scenarios with selectors and actions.`
      }]
    });

    // Claude returns text, so parse it as JSON
    return JSON.parse(message.content[0].text);
  }

  // Validate if user flow completed successfully
  async validateUserFlow(flowDescription, expectedOutcome) {
    const screenshot = await this.page.screenshot({ encoding: 'base64' });
    const pageState = await this.page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        bodyText: document.body.innerText.substring(0, 1000),
        formData: Array.from(document.querySelectorAll('input')).map(input => ({
          name: input.name,
          value: input.value,
          type: input.type
        }))
      };
    });

    const message = await anthropic.messages.create({
      model: "claude-3-opus-20240229",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: `Did this flow complete successfully?
          Flow: ${flowDescription}
          Expected: ${expectedOutcome}
          Current URL: ${pageState.url}
          Page Title: ${pageState.title}
          Page Text: ${pageState.bodyText}
          Form Data: ${JSON.stringify(pageState.formData)}

          Respond with JSON: { "success": boolean, "reason": string, "suggestions": array }

          Note: I cannot analyze the screenshot directly, but I'm evaluating based on the page state data provided.`
      }]
    });

    return JSON.parse(message.content[0].text);
  }

  // Generate dynamic test data based on form requirements
  async generateTestData(formSelectors) {
    const formStructure = await this.page.evaluate((selectors) => {
      const form = document.querySelector(selectors);
      if (!form) return null;

      return Array.from(form.querySelectorAll('input, select, textarea')).map(field => ({
        name: field.name,
        type: field.type,
        placeholder: field.placeholder,
        required: field.required,
        pattern: field.pattern,
        maxLength: field.maxLength,
        options: field.tagName === 'SELECT' ? 
          Array.from(field.options).map(opt => opt.value) : null
      }));
    }, formSelectors);

    const message = await anthropic.messages.create({
      model: "claude-3-opus-20240229",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: `Generate realistic test data for form fields. Return valid data that would pass validation.

          Form fields: ${JSON.stringify(formStructure)}

          Return JSON object with field names as keys and test values as values.`
      }]
    });

    return JSON.parse(message.content[0].text);
  }

  // Auto-heal broken selectors
  async findElement(description, fallbackSelectors = []) {
    // Try provided selectors first
    for (const selector of fallbackSelectors) {
      try {
        const element = await this.page.$(selector);
        if (element) return { selector, element };
      } catch (e) {
        continue;
      }
    }

    // If all fail, use AI to find the element
    const pageContent = await this.page.content();

    const message = await anthropic.messages.create({
      model: "claude-3-opus-20240229",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `You are a CSS selector expert. Find the most specific and reliable selector for the described element.

          Find selector for: "${description}"
          in this HTML (first 3000 chars): ${pageContent.substring(0, 3000)}

          Return JSON: { "selector": string, "confidence": number, "alternatives": array }`
      }]
    });

    const result = JSON.parse(message.content[0].text);
    const element = await this.page.$(result.selector);

    if (!element && result.alternatives) {
      for (const altSelector of result.alternatives) {
        const altElement = await this.page.$(altSelector);
        if (altElement) return { selector: altSelector, element: altElement };
      }
    }

    return { selector: result.selector, element };
  }
}