# Spec Automation with AI (GPT-4)

## Overview

This enhanced spec automation script uses OpenAI's GPT-4 API to generate intelligent, detailed implementation specifications for GitHub issues. Instead of basic template parsing, it analyzes issue context comprehensively and generates developer-ready specs.

## Features

### 🤖 AI-Powered Spec Generation

- Uses GPT-4 to generate comprehensive, actionable specifications
- Analyzes issue context including title, description, labels, and related code
- Generates detailed implementation plans with specific technical steps
- Includes code snippets and pseudocode where helpful
- Falls back to template-based generation if AI is unavailable

### 📊 Enhanced Context Gathering

- **Issue Analysis**: Full parsing of issue title, body, and metadata
- **Code Context**: Identifies potentially affected files from issue content
- **Similar Issues**: Finds related issues for context
- **Recent Commits**: Searches for relevant recent commits
- **Related PRs**: Identifies pull requests that might be related
- **Label Intelligence**: Extracts priority, complexity, and category from labels

### 🔄 Robust Error Handling

- Exponential backoff for rate limiting (both GitHub and OpenAI APIs)
- Graceful fallback to template-based generation if AI fails
- Comprehensive error logging and reporting
- Handles API authentication errors with clear messages

## Setup

### Prerequisites

1. **GitHub Token**: Set `GITHUB_TOKEN` environment variable
2. **OpenAI API Key**: Set `OPENAI_API_KEY` in Replit secrets (already configured)
3. **Dependencies**: Installed via npm (openai, @octokit/rest)

### Environment Variables

```bash
GITHUB_TOKEN=your_github_token_here
OPENAI_API_KEY=your_openai_api_key_here  # In Replit secrets
```

## Usage

### Process All Issues with 'needs-spec' Label

```bash
node .github/scripts/spec-automation.js all
```

### Process Specific Issue

```bash
node .github/scripts/spec-automation.js 123
```

### Process Multiple Issues

```bash
node .github/scripts/spec-automation.js 123,456,789
```

## AI Spec Generation Process

### 1. Context Collection

The script gathers comprehensive context for GPT-4:

- Issue title and full description
- Issue type (bug, feature, task)
- All labels and their meanings
- Potentially affected files mentioned in the issue
- Similar issues in the repository
- Recent commits that might be related
- Related pull requests
- Priority and complexity assessments

### 2. GPT-4 Prompt Engineering

The system uses a carefully crafted prompt that:

- Provides project context (Speddy tech stack and architecture)
- Includes all gathered issue context
- Requests specific sections for the specification
- Emphasizes actionable, developer-ready output

### 3. Specification Sections

GPT-4 generates specs with these sections:

1. **Problem Statement**: Clear description of what needs solving
2. **Proposed Solution**: High-level approach
3. **Technical Approach**: Detailed implementation plan
4. **Implementation Details**: Step-by-step guide with code
5. **Testing Requirements**: Specific test cases
6. **Acceptance Criteria**: Measurable completion criteria
7. **Potential Risks**: Technical risks and mitigations
8. **Estimated Effort**: Time estimate based on complexity

### 4. Output

- Specs are posted as comments on the GitHub issue
- Includes AI-generated indicator and metadata
- Preserves original issue body
- Adds appropriate labels based on analysis

## Fallback Behavior

If OpenAI API is unavailable or fails, the script falls back to template-based generation that still provides:

- Structured specification format
- Context-aware content based on labels and issue analysis
- Technical requirements extraction
- Testing strategy suggestions
- Risk assessment

## Rate Limiting & Performance

### OpenAI API

- Implements exponential backoff (2s, 4s, 8s)
- Maximum 3 retry attempts
- Clear error messages for authentication issues
- Graceful degradation to template mode

### GitHub API

- Similar exponential backoff strategy
- Handles rate limit headers
- Batches API calls where possible

## Testing

Run the test script to verify setup:

```bash
node .github/scripts/test-spec-automation.js
```

This will check:

- Environment variables are set
- OpenAI client initializes properly
- Dependencies are installed
- Script is ready to run

## Example Output

### AI-Generated Spec

````markdown
## 📋 Implementation Specification

### Problem Statement

Users need the ability to track and export their usage metrics for billing transparency...

### Proposed Solution

Implement a comprehensive metrics tracking system that collects usage data...

### Technical Approach

1. Create new database tables for metrics storage
2. Implement background job for data collection
3. Build API endpoints for metric retrieval
4. Create React components for visualization
   ...

### Implementation Details

```typescript
// Create metrics service
class MetricsService {
  async trackUsage(userId: string, metric: MetricType) {
    // Implementation here
  }
}
```
````

...

---

🤖 AI-Generated Specification by GPT-4 on 2024-01-15
Issue #123 | Priority: P1 | Complexity: M

```

## Monitoring & Logs

The script provides detailed logging:
- `🔍 Starting spec automation...` - Process begins
- `Processing issue #X` - Individual issue processing
- `✅ Posted AI-generated spec` - Successful spec generation
- `Rate limited. Waiting Xms` - Rate limit handling
- `Falling back to template` - Using fallback mode
- Error messages with details for troubleshooting

## Best Practices

1. **Review AI Specs**: Always review AI-generated specs before implementation
2. **Provide Context**: More detailed issue descriptions yield better specs
3. **Use Labels**: Proper labeling improves spec quality
4. **Monitor API Usage**: Track OpenAI API usage to manage costs
5. **Regular Updates**: Keep the project context in the prompt updated

## Troubleshooting

### "OpenAI API key not configured"
- Ensure `OPENAI_API_KEY` is set in Replit secrets
- Verify the key is valid and has GPT-4 access

### "Rate limit exceeded"
- Script automatically retries with backoff
- Consider processing fewer issues at once
- Check OpenAI/GitHub API quotas

### "Spec generation failed"
- Check error logs for specific issues
- Verify issue has sufficient content
- Fallback to template mode will be used

## Cost Considerations

- Each spec generation uses ~2,000-3,000 tokens
- GPT-4 Turbo pricing applies
- Monitor usage via OpenAI dashboard
- Consider batch processing during off-peak hours

## Future Enhancements

Potential improvements:
- Cache similar issue specs to reduce API calls
- Fine-tune prompts based on issue category
- Integrate with code analysis tools
- Add support for multiple AI models
- Implement spec quality scoring
```
