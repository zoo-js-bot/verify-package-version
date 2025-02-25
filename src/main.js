const axios = require('axios');
const core = require('@actions/core');
const { Octokit } = require('@octokit/rest');
const github = require('@actions/github');
const { readFileSync } = require('fs');

// **********************************************************
const token = core.getInput('token');
const octokit = new Octokit({ auth: `token ${token}` });
const context = github.context;

const FIXED = '<!-- Created by actions-cool/verify-package-version. Do not remove. -->';

// **********************************************************
async function run() {
  try {
    const { owner, repo } = context.repo;
    if (context.eventName === 'pull_request') {
      const title = context.payload.pull_request.title;
      const number = context.payload.pull_request.number;
      const label = context.payload.pull_request.head.label;
      const labels = label.split(':');

      const includeContent = core.getInput('title-include-content');
      const includeVersion = core.getInput('title-include-version') || 'true';
      const openComment = core.getInput('open-comment');

      let result = true;
      let errorMess = '';

      if (includeContent && !title.includes(includeContent)) {
        errorMess = `The PR title should include ${includeContent}!`;
        result = false;
      }

      let packageVersion = '';
      if (result && includeVersion && includeVersion == 'true') {
        if (owner === labels[0]) {
          const package = JSON.parse(readFileSync('./package.json'));
          packageVersion = package.version;
          core.info(`Query base repo version is ${packageVersion}`);
        } else {
          const URL = `https://raw.githubusercontent.com/${labels[0]}/${repo}/${labels[1]}/package.json`;
          const res = await axios.get(URL);
          packageVersion = res.data.version;
          core.info(`Query fork repo version is ${packageVersion}`);
        }
        if (!title.includes(packageVersion)) {
          errorMess = `The version of the PR title is not same with the package. Please check!`;
          result = false;
        }
      }

      if (openComment == 'true' && owner !== labels[0]) {
        core.info(`Comment only support base repositorie!`);
      } else if (openComment == 'true') {
        let ifHasComment = false;
        let commentId;

        const commentData = await octokit.issues.listComments({
          owner,
          repo,
          issue_number: number,
        });

        const commentsArr = commentData.data;
        for (let i = 0; i < commentsArr.length; i++) {
          if (commentsArr[i].body.includes(FIXED)) {
            ifHasComment = true;
            commentId = commentsArr[i].id;
          }
        }

        const titleVersion = title.split(' ').filter(item => !!item.match(/\d/g))[0] || '-';

        const versionMess = `| PR package version | PR title version |
| -- | -- |
| ${packageVersion} | ${titleVersion} |
`;

        let mess = '';
        if (result) {
          mess = `### 🎉 Verify package version passed!\n\n${FIXED}`;
        } else {
          mess = `### 🚨 Verify package version failed!\n\n${errorMess}\n\n${FIXED}`;
        }

        if (packageVersion && includeVersion == 'true') {
          mess += `\n\n${versionMess}`;
        }

        if (ifHasComment) {
          await octokit.issues.updateComment({
            owner,
            repo,
            comment_id: commentId,
            body: mess,
          });
          core.info(`update-comment!`);
        } else {
          await octokit.issues.createComment({
            owner,
            repo,
            issue_number: number,
            body: mess,
          });
          core.info(`create-comment!`);
        }
      }

      if (result) {
        core.info(`Verify package version passed!`);
      } else {
        core.setFailed(`Verify package version failed! ${errorMess}`);
      }
    } else {
      core.info(
        "This is now support 'pull_request'. I haven't thought about other trigger verification conditions for the time being, you can propose them!",
      );
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

// **********************************************************
run();
