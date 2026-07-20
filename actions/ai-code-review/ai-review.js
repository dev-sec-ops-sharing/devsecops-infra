const fs = require('node:fs');
const github = require('@actions/github');
const core = require('@actions/core');

async function cleanUpOldComments(octokit, context, prNumber) {
  try {
    core.info(`Starting cleanup for PR #${prNumber}`);
    const oldComments = await octokit.rest.pulls.listReviewComments({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: prNumber,
    });
    core.info(`Found ${oldComments.data.length} inline review comments.`);
    for (const comment of oldComments.data) {
      if (comment.user?.login?.includes('github-actions')) {
        core.info(`Deleting old review comment ID: ${comment.id}`);
        await octokit.rest.pulls.deleteReviewComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          comment_id: comment.id,
        });
      }
    }
    
    // Clean up old bot conversation comments
    const oldIssueComments = await octokit.rest.issues.listComments({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: prNumber,
    });
    core.info(`Found ${oldIssueComments.data.length} conversation comments.`);
    for (const comment of oldIssueComments.data) {
      if (comment.user?.login?.includes('github-actions') && comment.body?.includes('🤖 AI Code Review')) {
        core.info(`Deleting old issue comment ID: ${comment.id}`);
        await octokit.rest.issues.deleteComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          comment_id: comment.id,
        });
      }
    }
    core.info("Cleaned up old bot review comments successfully.");
  } catch (err) {
    core.error(`Failed to clean up old comments: ${err.message}`);
  }
}

async function postReview(octokit, context, prNumber, comments) {
  try {
    await octokit.rest.pulls.createReview({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: prNumber,
      event: 'COMMENT',
      comments: comments.map(c => ({
        path: c.path,
        line: Number.parseInt(c.line, 10),
        body: c.body
      }))
    });
    core.info(`Successfully posted ${comments.length} inline review comments.`);
  } catch (apiError) {
    core.warning(`Failed to post inline review comments: ${apiError.message}. Falling back to single conversation comment.`);
    const markdownBody = comments.map(c => `### 📄 File: \`${c.path}\` (Line ${c.line})\n${c.body}`).join('\n\n');
    await octokit.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: prNumber,
      body: `## 🤖 AI Code Review (Gemini)\n\n${markdownBody}`
    });
  }
}

async function run() {
  try {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const githubToken = process.env.GITHUB_TOKEN;

    if (!geminiApiKey) {
      core.warning("GEMINI_API_KEY is not set. Skipping AI review.");
      return;
    }
    if (!githubToken) {
      core.warning("GITHUB_TOKEN is not set. Skipping AI review.");
      return;
    }

    const octokit = github.getOctokit(githubToken);
    const context = github.context;
    const prNumber = context.payload.pull_request?.number || null;

    if (!prNumber) {
      core.warning("Not a pull request. Skipping AI review.");
      return;
    }

    const diff = fs.existsSync('diff.txt') ? fs.readFileSync('diff.txt', 'utf8') : '';
    if (!diff) {
      core.info("No diff found or diff.txt is empty. Skipping AI review.");
      return;
    }

    await cleanUpOldComments(octokit, context, prNumber);

    const prompt = `Review this code diff for security issues, bugs, and best practices. 
    You must analyze the diff and return a JSON array of review comments.
    Each comment object in the array must contain:
    - 'path': (string) the relative file path where the issue occurs (e.g. 'src/transaction.controller.ts')
    - 'line': (integer) the line number in the new/modified file where the issue is found (refer to the lines starting with '+' in the diff)
    - 'body': (string) the review comment explaining the issue and how to fix it, formatted in markdown.

    If no issues are found, return an empty array [].
    Do not include any other text, explanations, or code blocks outside the JSON array.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `${prompt}\n\nCode Diff:\n${diff}`
          }]
        }],
        systemInstruction: {
          parts: [{
            text: "You are a Senior DevSecOps Engineer. Your task is to perform an automated code review on the provided pull request git diff. Analyze the code strictly for security vulnerabilities (e.g., OWASP Top 10, SQL Injection, XSS, hardcoded secrets, authentication flaws), logical bugs, performance bottlenecks, and code quality issues. Be constructive, concise, and professional."
          }]
        },
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    const result = await response.json();
    if (!result.candidates || result.candidates.length === 0) {
      core.warning("No response candidates received from Gemini.");
      return;
    }

    const textResponse = result.candidates[0].content.parts[0].text;
    core.info(`Raw Gemini response received.`);
    core.debug(`Gemini Response: ${textResponse}`);

    let comments = [];
    try {
      comments = JSON.parse(textResponse);
    } catch (e) {
      core.error(`Failed to parse Gemini response as JSON: ${e.message}`);
      await octokit.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: prNumber,
        body: `## 🤖 AI Code Review (Gemini)\n\n${textResponse}`
      });
      return;
    }

    if (!Array.isArray(comments) || comments.length === 0) {
      core.info("No code review comments generated by AI.");
      return;
    }

    await postReview(octokit, context, prNumber, comments);
  } catch (error) {
    core.setFailed(`AI Review failed: ${error.message}`);
  }
}

run();
