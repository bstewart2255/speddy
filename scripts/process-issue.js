const fs = require('fs');
const { Octokit } = require('@octokit/rest');
const fetch = require('node-fetch');

async function main(){
  const eventPath = process.argv[2];
  if(!eventPath){
    console.error('Usage: node process-issue.js <GITHUB_EVENT_PATH>');
    process.exit(1);
  }
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  const issue = event.issue;
  const action = event.action;
  const title = issue.title || '';
  const lc = title.toLowerCase();
  if(!(lc.startsWith('bug:') || lc.startsWith('feature:') || lc.startsWith('task:') || (issue.labels||[]).some(l=>l.name==='brain-dump'))){
    console.log('Not a brain-dump issue, skipping');
    return;
  }

  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  // Simple spec generation placeholder - in real flow we'd analyze code and DB
  const spec = `# Generated Spec\n\nOriginal title: ${title}\n\nOriginal body:\n${issue.body || ''}\n\n--\nThis is an automated generated spec (placeholder).`;

  await octokit.rest.issues.update({
    owner: event.repository.owner.login,
    repo: event.repository.name,
    issue_number: issue.number,
    body: spec
  });

  await octokit.rest.issues.addLabels({
    owner: event.repository.owner.login,
    repo: event.repository.name,
    issue_number: issue.number,
    labels: ['spec:done']
  });

  console.log('Processed issue', issue.number);
}

main().catch(err=>{console.error(err); process.exit(1)});
