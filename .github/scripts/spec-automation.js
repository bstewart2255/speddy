const { Octokit } = require('@octokit/rest');
const fs = require('fs').promises;
const OpenAI = require('openai');

class SpecAutomation {
  // Constants for configuration
  static KEYWORD_MIN_LENGTH = 4;
  static KEYWORD_MAX_COUNT = 5;
  static KEYWORD_STOPWORDS = ['this', 'that', 'with', 'from', 'should', 'would', 'could', 'have', 'been', 'will', 'what', 'when', 'where'];
  static TITLE_SEARCH_MAX_LENGTH = 50;
  static MAX_AFFECTED_FILES = 10;
  static MAX_SIMILAR_ISSUES = 3;
  static MAX_REQUIREMENTS = 10;
  static API_RETRY_DELAY = 1000; // milliseconds
  static API_MAX_RETRIES = 3;

  constructor() {
    this.octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    
    // Initialize OpenAI client with API key from Replit secrets
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    this.repo = { owner: 'bstewart2255', repo: 'speddy' };
    this.processedItems = [];
    this.lastProcessedContext = null;
  }

  async run(issueInput) {
    console.log('🔍 Starting spec automation...');
    
    // 1. INTAKE & DEDUPLICATION
    const issues = await this.getIssuesNeedingSpecs(issueInput);
    console.log(`Found ${issues.length} issues needing specs`);

    for (const issue of issues) {
      try {
        await this.processIssue(issue);
      } catch (error) {
        console.error(`Error processing issue #${issue.number}:`, error);
        // Add error label for manual review
        await this.addErrorLabel(issue, error);
      }
    }

    // 5. OUTPUT SUMMARY
    await this.generateSummary();
  }

  async getIssuesNeedingSpecs(issueInput) {
    if (issueInput === 'all') {
      const { data } = await this.octokit.issues.listForRepo({
        ...this.repo,
        labels: 'needs-spec',
        state: 'open'
      });
      return data;
    } else {
      const numbers = issueInput.split(',').map(n => parseInt(n.trim()));
      const issues = [];
      for (const number of numbers) {
        const { data } = await this.octokit.issues.get({
          ...this.repo,
          issue_number: number
        });
        issues.push(data);
      }
      return issues;
    }
  }

  async processIssue(issue) {
    console.log(`Processing issue #${issue.number}: ${issue.title}`);

    // Check existing labels for intelligence
    const existingLabels = issue.labels.map(l => l.name);
    
    // Check for deduplication
    const duplicates = await this.checkForDuplicates(issue);
    if (duplicates.length > 0) {
      await this.handleDuplicates(issue, duplicates);
      return;
    }

    // 2. CONTEXT GATHERING
    const context = await this.gatherContext(issue, existingLabels);
    this.lastProcessedContext = context;
    
    // 3. SPEC CREATION
    const spec = await this.createSpec(issue, context);
    
    // Update the issue
    await this.updateIssueWithSpec(issue, spec);
    
    // 4. FINALIZATION
    await this.finalizeIssue(issue);

    this.processedItems.push({
      number: issue.number,
      title: issue.title,
      priority: context.priority,
      complexity: context.complexity,
      category: context.category,
      discoveries: context.discoveries,
      blockers: context.blockers
    });
  }

  // Helper method for API calls with exponential backoff
  async makeApiCallWithRetry(apiCall, retries = SpecAutomation.API_MAX_RETRIES) {
    for (let i = 0; i < retries; i++) {
      try {
        return await apiCall();
      } catch (error) {
        if (error.status === 403 && error.message.includes('rate limit')) {
          if (i < retries - 1) {
            const delay = SpecAutomation.API_RETRY_DELAY * Math.pow(2, i);
            console.log(`Rate limited. Waiting ${delay}ms before retry ${i + 1}/${retries}...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
    }
  }

  async checkForDuplicates(issue) {
    // Truncate the title at the last word boundary
    let truncatedTitle = issue.title;
    if (issue.title.length > SpecAutomation.TITLE_SEARCH_MAX_LENGTH) {
      const lastSpace = issue.title.lastIndexOf(' ', SpecAutomation.TITLE_SEARCH_MAX_LENGTH);
      if (lastSpace > 0) {
        truncatedTitle = issue.title.substring(0, lastSpace);
      } else {
        truncatedTitle = issue.title.substring(0, SpecAutomation.TITLE_SEARCH_MAX_LENGTH);
      }
    }
    const searchQuery = `repo:${this.repo.owner}/${this.repo.repo} is:issue ${truncatedTitle}`;
    
    try {
      const { data } = await this.makeApiCallWithRetry(() =>
        this.octokit.search.issuesAndPullRequests({
          q: searchQuery
        })
      );
      
      return data.items.filter(item => 
        item.number !== issue.number && 
        item.state === 'open'
      ).slice(0, SpecAutomation.MAX_SIMILAR_ISSUES);
    } catch (error) {
      console.error('Error searching for duplicates:', error);
      return [];
    }
  }

  async handleDuplicates(issue, duplicates) {
    const duplicateLinks = duplicates.map(d => `#${d.number}`).join(', ');
    
    await this.octokit.issues.createComment({
      ...this.repo,
      issue_number: issue.number,
      body: `🔍 **Potential Duplicates Found**\n\nSimilar issues: ${duplicateLinks}\n\nPlease review and close if duplicate, or add \`not-duplicate\` label to proceed with spec generation.`
    });

    await this.octokit.issues.addLabels({
      ...this.repo,
      issue_number: issue.number,
      labels: ['needs-clarification', 'potential-duplicate']
    });
  }

  async gatherContext(issue, existingLabels) {
    // Browse repository for affected files
    const affectedFiles = await this.findAffectedFiles(issue);
    
    // Check for similar implementations
    const similarIssues = await this.findSimilarIssues(issue);
    
    // Get recent related commits if any
    const recentCommits = await this.getRecentCommits(issue);
    
    // Get related PRs if any
    const relatedPRs = await this.getRelatedPRs(issue);
    
    // Parse issue type and content
    const issueType = this.parseIssueType(issue, existingLabels);
    const requirements = this.extractRequirements(issue.body);
    
    // Label-based intelligence
    const priority = this.extractPriorityFromLabels(existingLabels);
    const complexity = this.extractComplexityFromLabels(existingLabels);
    const category = this.extractCategoryFromLabels(existingLabels);
    
    // Technical analysis
    const dbChanges = this.analyzeDbRequirements(issue.body);
    const apiChanges = this.analyzeApiRequirements(issue.body);
    const securityImpact = this.analyzeSecurityImpact(issue.body, existingLabels);

    return {
      affectedFiles,
      similarIssues,
      recentCommits,
      relatedPRs,
      issueType,
      requirements,
      priority,
      complexity,
      category,
      dbChanges,
      apiChanges,
      securityImpact,
      discoveries: [],
      blockers: []
    };
  }

  async findAffectedFiles(issue) {
    // Extract file paths from issue body if mentioned
    const body = issue.body || '';
    const fileMatches = body.match(/[\w\-\/]+\.(tsx?|jsx?|sql|md)/g) || [];
    
    // Look for component/page mentions
    const componentMatches = body.match(/(\w+)Component|\w+Page|\w+Modal/g) || [];
    
    return [...fileMatches, ...componentMatches].slice(0, SpecAutomation.MAX_AFFECTED_FILES);
  }

  async findSimilarIssues(issue) {
    const keywords = this.extractKeywords(issue.title + ' ' + (issue.body || ''));
    const searchQuery = `repo:${this.repo.owner}/${this.repo.repo} ${keywords.slice(0, 3).join(' ')}`;
    
    try {
      const { data } = await this.makeApiCallWithRetry(() => 
        this.octokit.search.issuesAndPullRequests({
          q: searchQuery
        })
      );
      return data.items.filter(item => item.number !== issue.number).slice(0, SpecAutomation.MAX_SIMILAR_ISSUES);
    } catch (error) {
      return [];
    }
  }

  async getRecentCommits(issue) {
    // Search for commits that might be related based on keywords
    const keywords = this.extractKeywords(issue.title);
    if (keywords.length === 0) return [];
    
    try {
      const { data } = await this.makeApiCallWithRetry(() =>
        this.octokit.repos.listCommits({
          ...this.repo,
          per_page: 10
        })
      );
      
      // Filter commits that might be related
      return data.filter(commit => {
        const message = commit.commit.message.toLowerCase();
        return keywords.some(keyword => message.includes(keyword.toLowerCase()));
      }).slice(0, 3);
    } catch (error) {
      console.error('Error fetching commits:', error);
      return [];
    }
  }

  async getRelatedPRs(issue) {
    // Search for PRs that might be related
    const keywords = this.extractKeywords(issue.title);
    if (keywords.length === 0) return [];
    
    const searchQuery = `repo:${this.repo.owner}/${this.repo.repo} is:pr ${keywords[0]}`;
    
    try {
      const { data } = await this.makeApiCallWithRetry(() =>
        this.octokit.search.issuesAndPullRequests({
          q: searchQuery
        })
      );
      
      return data.items.slice(0, 3);
    } catch (error) {
      console.error('Error fetching PRs:', error);
      return [];
    }
  }

  extractKeywords(text) {
    return text.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length >= SpecAutomation.KEYWORD_MIN_LENGTH)
      .filter(word => !SpecAutomation.KEYWORD_STOPWORDS.includes(word))
      .slice(0, SpecAutomation.KEYWORD_MAX_COUNT);
  }

  parseIssueType(issue, labels) {
    // Check labels first
    if (labels.includes('bug') || labels.includes('hotfix')) return 'BUG';
    if (labels.includes('feature') || labels.includes('enhancement')) return 'FEATURE';
    if (labels.includes('task') || labels.includes('chore')) return 'TASK';
    
    // Fallback to title parsing
    const title = issue.title.toLowerCase();
    if (title.includes('bug') || title.includes('error') || title.includes('fix')) return 'BUG';
    if (title.includes('feature') || title.includes('add') || title.includes('implement')) return 'FEATURE';
    return 'TASK';
  }

  extractRequirements(body) {
    if (!body) return [];
    
    const lines = body.split('\n');
    return lines.filter(line => {
      const lowerLine = line.toLowerCase();
      return lowerLine.includes('bug:') || 
             lowerLine.includes('feature:') || 
             lowerLine.includes('task:') ||
             lowerLine.startsWith('- [ ]') ||
             lowerLine.startsWith('* ');
    }).slice(0, SpecAutomation.MAX_REQUIREMENTS);
  }

  // LABEL PARSING METHODS
  extractPriorityFromLabels(labels) {
    if (labels.includes('priority:critical') || labels.includes('urgent')) return 'P0';
    if (labels.includes('priority:high')) return 'P1';
    if (labels.includes('priority:medium')) return 'P2';
    if (labels.includes('priority:low')) return 'P3';
    if (labels.includes('bug')) return 'P1'; // Bugs default to P1
    return 'P2'; // Default
  }

  extractComplexityFromLabels(labels) {
    if (labels.includes('size:large') || labels.includes('epic')) return 'L';
    if (labels.includes('size:medium')) return 'M';
    if (labels.includes('size:small') || labels.includes('good first issue')) return 'S';
    
    // Infer from issue type
    if (labels.includes('bug')) return 'S'; // Most bugs are small
    if (labels.includes('feature')) return 'M'; // Features default to medium
    return 'M'; // Default
  }

  extractCategoryFromLabels(labels) {
    if (labels.some(l => l.includes('frontend') || l.includes('ui'))) return 'frontend';
    if (labels.some(l => l.includes('backend') || l.includes('api'))) return 'backend';
    if (labels.some(l => l.includes('database') || l.includes('db'))) return 'database';
    if (labels.some(l => l.includes('payment') || l.includes('stripe'))) return 'payment';
    if (labels.some(l => l.includes('auth'))) return 'auth';
    return 'general';
  }

  analyzeDbRequirements(body) {
    if (!body) return 'None expected';
    
    const lowerBody = body.toLowerCase();
    const dbKeywords = ['database', 'table', 'migration', 'supabase', 'sql', 'schema'];
    
    if (dbKeywords.some(keyword => lowerBody.includes(keyword))) {
      return 'Database modifications likely needed - review schema changes';
    }
    return 'None expected';
  }

  analyzeApiRequirements(body) {
    if (!body) return 'None expected';
    
    const lowerBody = body.toLowerCase();
    const apiKeywords = ['api', 'endpoint', 'route', '/api/', 'fetch', 'request'];
    
    if (apiKeywords.some(keyword => lowerBody.includes(keyword))) {
      return 'API changes likely needed - review endpoints';
    }
    return 'None expected';
  }

  analyzeSecurityImpact(body, labels) {
    const securityKeywords = ['auth', 'permission', 'user', 'login', 'password', 'token', 'security'];
    const lowerBody = (body || '').toLowerCase();
    
    if (labels.some(l => l.includes('security')) || 
        securityKeywords.some(keyword => lowerBody.includes(keyword))) {
      return 'Authentication/authorization review needed';
    }
    return 'Standard security practices apply';
  }

  async createSpec(issue, context) {
    try {
      // Use OpenAI to generate intelligent spec
      const aiSpec = await this.generateAISpec(issue, context);
      
      if (aiSpec) {
        return aiSpec;
      }
      
      // Fallback to template-based generation if AI fails
      console.log('Falling back to template-based spec generation');
      return this.createTemplateSpec(issue, context);
    } catch (error) {
      console.error('Error generating AI spec:', error);
      // Fallback to template-based generation
      return this.createTemplateSpec(issue, context);
    }
  }

  async generateAISpec(issue, context) {
    // Prepare context for GPT-4
    const contextInfo = {
      issueTitle: issue.title,
      issueBody: issue.body || 'No description provided',
      issueNumber: issue.number,
      issueType: context.issueType,
      labels: issue.labels.map(l => l.name),
      affectedFiles: context.affectedFiles,
      similarIssues: context.similarIssues.map(i => ({
        number: i.number,
        title: i.title
      })),
      recentCommits: context.recentCommits.map(c => ({
        message: c.commit.message,
        author: c.commit.author.name
      })),
      relatedPRs: context.relatedPRs.map(pr => ({
        number: pr.number,
        title: pr.title,
        state: pr.state
      })),
      priority: context.priority,
      complexity: context.complexity,
      category: context.category
    };

    const systemPrompt = `You are an expert software architect creating detailed implementation specifications for the Speddy project - a modern web application for dispatch management. Your specs should be immediately actionable by developers.

The Speddy project uses:
- Next.js/React for frontend
- Supabase for backend and database
- TypeScript throughout
- Tailwind CSS for styling
- Stripe for payments
- Modern React patterns (hooks, functional components)

Generate comprehensive, developer-ready specifications that include concrete implementation details.`;

    const userPrompt = `Generate a detailed implementation specification for the following GitHub issue:

Issue #${contextInfo.issueNumber}: ${contextInfo.issueTitle}

Description:
${contextInfo.issueBody}

Context Information:
- Issue Type: ${contextInfo.issueType}
- Labels: ${contextInfo.labels.join(', ')}
- Priority: ${contextInfo.priority}
- Complexity: ${contextInfo.complexity}
- Category: ${contextInfo.category}
${contextInfo.affectedFiles.length > 0 ? `- Potentially Affected Files: ${contextInfo.affectedFiles.join(', ')}` : ''}
${contextInfo.similarIssues.length > 0 ? `- Similar Issues: ${contextInfo.similarIssues.map(i => `#${i.number}: ${i.title}`).join(', ')}` : ''}
${contextInfo.recentCommits.length > 0 ? `- Recent Related Commits: ${contextInfo.recentCommits.map(c => c.message).join('; ')}` : ''}
${contextInfo.relatedPRs.length > 0 ? `- Related PRs: ${contextInfo.relatedPRs.map(pr => `#${pr.number}: ${pr.title} (${pr.state})`).join(', ')}` : ''}

Please generate a comprehensive specification with the following sections:

1. **Problem Statement**: Clear description of what needs to be solved and why
2. **Proposed Solution**: High-level approach to solving the problem
3. **Technical Approach**: Detailed technical implementation plan including:
   - Specific files to create/modify
   - Key functions/components to implement
   - Data structures and interfaces
   - Database schema changes if needed
   - API endpoints if needed
4. **Implementation Details**: Step-by-step implementation guide with code snippets or pseudocode where helpful
5. **Testing Requirements**: Specific test cases and scenarios to validate
6. **Acceptance Criteria**: Clear, measurable criteria for completion
7. **Potential Risks & Mitigations**: Technical risks and how to handle them
8. **Estimated Effort**: Time estimate based on complexity

Format the specification in clean Markdown with proper headers and bullet points. Be specific and actionable - developers should be able to start coding immediately after reading this spec.`;

    try {
      // Make OpenAI API call with retry logic
      const completion = await this.makeOpenAICallWithRetry(async () => {
        return await this.openai.chat.completions.create({
          model: 'gpt-4-turbo-preview',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
          max_tokens: 2500
        });
      });

      const aiGeneratedSpec = completion.choices[0].message.content;
      
      // Add metadata footer
      const fullSpec = `${aiGeneratedSpec}

---
*🤖 AI-Generated Specification by GPT-4 on ${new Date().toISOString().split('T')[0]}*
*Issue #${issue.number} | Priority: ${context.priority} | Complexity: ${context.complexity}*`;

      return fullSpec;
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw error;
    }
  }

  async makeOpenAICallWithRetry(apiCall, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        return await apiCall();
      } catch (error) {
        if (error.status === 429 || (error.response && error.response.status === 429)) {
          // Rate limit error - wait with exponential backoff
          if (i < retries - 1) {
            const delay = Math.pow(2, i) * 2000; // 2s, 4s, 8s
            console.log(`OpenAI rate limited. Waiting ${delay}ms before retry ${i + 1}/${retries}...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            throw error;
          }
        } else if (error.status === 401 || (error.response && error.response.status === 401)) {
          console.error('OpenAI API key is invalid or not set. Please set OPENAI_API_KEY in Replit secrets.');
          throw new Error('OpenAI API key not configured');
        } else {
          throw error;
        }
      }
    }
  }

  // Keep the template-based spec as fallback
  createTemplateSpec(issue, context) {
    const titlePrefix = `[${context.issueType}]`;
    const formattedTitle = issue.title.startsWith('[') ? issue.title : `${titlePrefix} ${issue.title}`;

    const specTemplate = `# ${formattedTitle}

## Problem Statement
${this.generateProblemStatement(issue, context)}

## Current State
- **Affected files**: ${context.affectedFiles.length > 0 ? context.affectedFiles.map(f => `\`${f}\``).join(', ') : 'TBD'}
- **Current behavior**: ${this.extractCurrentBehavior(issue)}
- **Related components**: ${this.extractComponents(context)}

## Technical Requirements
- **Files to modify**: ${context.affectedFiles.length > 0 ? context.affectedFiles.map(f => `\`${f}\``).join(', ') : 'TBD'}
- **Database changes**: ${context.dbChanges}
- **API changes**: ${context.apiChanges}
- **Dependencies**: ${context.blockers.length > 0 ? context.blockers.join(', ') : 'None identified'}

## Implementation Approach
${this.generateImplementationApproach(issue, context)}

## Acceptance Criteria
${this.generateAcceptanceCriteria(issue, context)}

## Priority & Estimation
- **Priority**: ${context.priority}
- **Complexity**: ${context.complexity} (${this.getComplexityDescription(context.complexity)})
- **Category**: ${context.category}
- **Dependencies**: ${context.blockers.length > 0 ? context.blockers.join(', ') : 'None'}

## Risk Assessment
- **Performance impact**: ${this.assessPerformanceImpact(context)}
- **Security considerations**: ${context.securityImpact}
- **Rollback plan**: ${this.generateRollbackPlan(context)}

## Testing Strategy
- **Unit tests needed**: ${this.identifyUnitTests(context)}
- **Integration tests**: ${this.identifyIntegrationTests(context)}
- **Manual testing steps**: ${this.generateManualTestSteps(issue, context)}

${context.similarIssues.length > 0 ? `
## Related Issues
${context.similarIssues.map(issue => `- #${issue.number}: ${issue.title}`).join('\n')}
` : ''}

---
*Auto-generated spec on ${new Date().toISOString().split('T')[0]} - Review and refine as needed*`;

    return specTemplate;
  }

  // SPEC GENERATION HELPER METHODS
  generateProblemStatement(issue, context) {
    if (context.issueType === 'BUG') {
      return `**Bug Impact**: ${this.extractBugImpact(issue)}\n\n${this.cleanDescription(issue.body)}`;
    } else if (context.issueType === 'FEATURE') {
      return `**User Need**: ${this.extractUserNeed(issue)}\n\n${this.cleanDescription(issue.body)}`;
    } else {
      return `**Technical Objective**: ${this.cleanDescription(issue.body)}`;
    }
  }

  extractBugImpact(issue) {
    const body = issue.body || '';
    if (body.includes('error') || body.includes('crash')) return 'Application functionality broken';
    if (body.includes('slow') || body.includes('performance')) return 'Performance degradation';
    return 'User experience impacted';
  }

  extractUserNeed(issue) {
    const body = issue.body || '';
    if (body.includes('user') || body.includes('customer')) return 'User-requested enhancement';
    return 'Product improvement needed';
  }

  cleanDescription(body) {
    if (!body) return 'TBD - Needs more details';
    
    // Take first paragraph or first 200 chars
    const firstPara = body.split('\n')[0];
    return firstPara.length > 200 ? firstPara.substring(0, 200) + '...' : firstPara;
  }

  extractCurrentBehavior(issue) {
    const body = issue.body || '';
    if (body.includes('currently') || body.includes('now')) {
      const lines = body.split('\n');
      const currentLine = lines.find(line => 
        line.toLowerCase().includes('currently') || 
        line.toLowerCase().includes('now')
      );
      return currentLine || 'TBD - Needs investigation';
    }
    return 'TBD - Needs investigation';
  }

  extractComponents(context) {
    if (context.affectedFiles.length > 0) {
      return context.affectedFiles.slice(0, 3).map(f => `\`${f}\``).join(', ');
    }
    return 'TBD - Identify during implementation';
  }

  generateImplementationApproach(issue, context) {
    const steps = [
      '1. **Analysis**: Review current implementation and identify root cause',
      '2. **Design**: Follow existing Speddy patterns and architectural decisions',
      '3. **Implementation**: Make changes incrementally with proper error handling',
      '4. **Testing**: Validate functionality and ensure no regressions'
    ];

    if (context.dbChanges !== 'None expected') {
      steps.splice(2, 0, '3. **Database**: Create migration scripts and update schema');
    }

    if (context.apiChanges !== 'None expected') {
      steps.splice(-1, 0, '4. **API**: Update endpoints and maintain backward compatibility');
    }

    return steps.join('\n');
  }

  generateAcceptanceCriteria(issue, context) {
    const criteria = [];
    
    if (context.issueType === 'BUG') {
      criteria.push('- [ ] Bug is completely resolved and no longer reproducible');
      criteria.push('- [ ] No new regressions introduced');
    } else if (context.issueType === 'FEATURE') {
      criteria.push('- [ ] Feature works as described in all specified scenarios');
      criteria.push('- [ ] User interface is intuitive and follows Speddy design patterns');
    }
    
    criteria.push('- [ ] All edge cases and error scenarios handled properly');
    criteria.push('- [ ] Performance impact is acceptable (< 100ms additional load time)');
    criteria.push('- [ ] Mobile responsiveness maintained');
    criteria.push('- [ ] Accessibility standards met');
    
    if (context.securityImpact !== 'Standard security practices apply') {
      criteria.push('- [ ] Security review completed and approved');
    }

    return criteria.join('\n');
  }

  getComplexityDescription(complexity) {
    switch(complexity) {
      case 'S': return 'Small: <1 day';
      case 'M': return 'Medium: 1-3 days';
      case 'L': return 'Large: 3+ days';
      default: return 'Medium: 1-3 days';
    }
  }

  assessPerformanceImpact(context) {
    if (context.dbChanges !== 'None expected') return 'Database changes may impact query performance';
    if (context.category === 'frontend') return 'Minimal - frontend changes only';
    if (context.complexity === 'L') return 'Potential impact - requires performance testing';
    return 'Minimal expected';
  }

  generateRollbackPlan(context) {
    if (context.dbChanges !== 'None expected') {
      return 'Database rollback script required; coordinate with deployment process';
    }
    return 'Standard Git revert; Replit redeploy from previous commit';
  }

  identifyUnitTests(context) {
    if (context.affectedFiles.length > 0) {
      return `Test functions in: ${context.affectedFiles.slice(0, 2).join(', ')}`;
    }
    if (context.category === 'api') return 'API endpoint functions and validation logic';
    if (context.category === 'frontend') return 'Component rendering and user interaction logic';
    return 'TBD - Identify during implementation';
  }

  identifyIntegrationTests(context) {
    const tests = [];
    
    if (context.apiChanges !== 'None expected') tests.push('API endpoint responses');
    if (context.dbChanges !== 'None expected') tests.push('Database operations and data integrity');
    if (context.category === 'payment') tests.push('Stripe integration (test mode)');
    if (context.category === 'auth') tests.push('Authentication flows');
    
    return tests.length > 0 ? tests.join(', ') : 'Standard application flow testing';
  }

  generateManualTestSteps(issue, context) {
    if (context.issueType === 'BUG') {
      return `1. Reproduce original bug scenario\n2. Verify fix resolves the issue\n3. Test related functionality for regressions`;
    }
    return `1. Test happy path scenarios\n2. Test edge cases and error conditions\n3. Verify mobile responsiveness`;
  }

  async updateIssueWithSpec(issue, spec) {
    // Post spec as a comment instead of replacing issue body
    await this.octokit.issues.createComment({
      ...this.repo,
      issue_number: issue.number,
      body: `## 📋 Implementation Specification

${spec}

---
*Please review this AI-generated specification and provide feedback. Once approved, developers can use this as the implementation guide.*`
    });
    
    console.log(`✅ Posted AI-generated spec to issue #${issue.number}`);
  }

  async finalizeIssue(issue) {
    const context = this.lastProcessedContext;
    
    // Add smart labels based on spec
    const labelsToAdd = ['spec:done'];
    
    // Add category labels if not present
    if (context.category && context.category !== 'general' && 
        !issue.labels.some(l => l.name.includes(context.category))) {
      labelsToAdd.push(`category:${context.category}`);
    }
    
    // Add complexity if not present  
    if (!issue.labels.some(l => l.name.includes('size:'))) {
      labelsToAdd.push(`size:${context.complexity.toLowerCase()}`);
    }

    // Add priority if not present
    if (!issue.labels.some(l => l.name.includes('priority:'))) {
      const priorityLabel = {
        'P0': 'priority:critical',
        'P1': 'priority:high', 
        'P2': 'priority:medium',
        'P3': 'priority:low'
      }[context.priority];
      if (priorityLabel) labelsToAdd.push(priorityLabel);
    }

    await this.octokit.issues.addLabels({
      ...this.repo,
      issue_number: issue.number,
      labels: labelsToAdd
    });

    // Remove needs-spec label
    try {
      await this.octokit.issues.removeLabel({
        ...this.repo,
        issue_number: issue.number,
        name: 'needs-spec'
      });
    } catch (error) {
      // Label might not exist, ignore
    }
  }

  async addErrorLabel(issue, error) {
    try {
      await this.octokit.issues.addLabels({
        ...this.repo,
        issue_number: issue.number,
        labels: ['spec:error']
      });

      await this.octokit.issues.createComment({
        ...this.repo,
        issue_number: issue.number,
        body: `❌ **Spec Generation Failed**\n\nError: ${error.message}\n\nPlease review and add more details, then re-add the \`needs-spec\` label.`
      });
    } catch (commentError) {
      console.error('Failed to add error label/comment:', commentError);
    }
  }

  async generateSummary() {
    const summary = `# Spec Generation Report

## Summary
- **Total Processed**: ${this.processedItems.length}
- **Generated**: ${new Date().toISOString().split('T')[0]}

## Processed Items

${this.processedItems.map(item => `
### Issue #${item.number}: ${item.title}
- **Priority**: ${item.priority}
- **Complexity**: ${item.complexity} 
- **Category**: ${item.category}
- **Blockers**: ${item.blockers.length > 0 ? item.blockers.join(', ') : 'None'}
`).join('\n')}

## Next Steps
1. **Review** generated specs for accuracy and completeness
2. **Refine** technical requirements and implementation details
3. **Assign** to appropriate developers based on category and complexity
4. **Prioritize** based on P0-P3 rankings

## Automation Stats
- **Context Analysis**: ✅ Completed
- **Label Intelligence**: ✅ Applied  
- **Duplicate Detection**: ✅ Checked
- **Technical Categorization**: ✅ Applied
    `.trim();

    await fs.writeFile('spec-report.md', summary);
    console.log('\n' + summary);
  }
}

// Export for testing
module.exports = { SpecAutomation };

// Run the automation if called directly
if (require.main === module) {
  const issueInput = process.argv[2] || 'all';
  new SpecAutomation().run(issueInput).catch(console.error);
}