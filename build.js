#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname);
const versionFile = path.join(root, 'VERSION');
const readmeFile = path.join(root, 'README.md');
const srcPath = path.join(root, 'src', 'follow-mode.js');
const distDir = path.join(root, 'dist');
const outPath = path.join(distDir, 'follow-mode.user.js');
const metaPath = path.join(distDir, 'follow-mode.meta.js');

const repo = 'mdiehn/iitc-plugin-follow-mode';
const baseVersion = fs.readFileSync(versionFile, 'utf8').trim();
const buildTime = new Date();
const branch = getCurrentBranch();
const distVersion = stampDevVersion(baseVersion, buildTime);
const updateUrl = `https://raw.githubusercontent.com/${repo}/refs/heads/${branch}/dist/follow-mode.meta.js`;
const downloadUrl = `https://raw.githubusercontent.com/${repo}/refs/heads/${branch}/dist/follow-mode.user.js`;

function pad(value) {
  return String(value).padStart(2, '0');
}

function buildStamp(date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function stampDevVersion(version, date) {
  if (!version.includes('-dev')) return version;
  return `${version}.${buildStamp(date)}`;
}

function getCurrentBranch() {
  try {
    const current = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    return current && current !== 'HEAD' ? current : 'main';
  } catch (error) {
    return 'main';
  }
}

function updateReadmeInstallLinks() {
  if (!fs.existsSync(readmeFile)) return;

  const readmeInstallUrl = `https://github.com/${repo}/raw/refs/heads/${branch}/dist/follow-mode.user.js`;
  const readmeMetaUrl = `https://github.com/${repo}/raw/refs/heads/${branch}/dist/follow-mode.meta.js`;
  const readme = fs.readFileSync(readmeFile, 'utf8');
  const updated = readme
    .replace(
      /\*\*Install:\*\* \[`follow-mode\.user\.js`\]\([^)]+\)/,
      `**Install:** [\`follow-mode.user.js\`](${readmeInstallUrl})`
    )
    .replace(
      /Plugin-manager metadata URL: \[`follow-mode\.meta\.js`\]\([^)]+\)/,
      `Plugin-manager metadata URL: [\`follow-mode.meta.js\`](${readmeMetaUrl})`
    );

  if (updated !== readme) {
    fs.writeFileSync(readmeFile, updated, 'utf8');
    console.log(`Updated README install links for ${branch}`);
  }
}

if (!fs.existsSync(srcPath)) {
  throw new Error('Missing source file: src/follow-mode.js');
}

fs.mkdirSync(distDir, { recursive: true });

const source = fs.readFileSync(srcPath, 'utf8')
  .replaceAll('__PLUGIN_VERSION__', distVersion)
  .replaceAll('__BUILD_TIME__', buildTime.toISOString());

const metadata = `// ==UserScript==
// @id             iitc-plugin-follow-mode
// @name           IITC plugin: Follow Mode Add-on
// @category       Add-on
// @version        ${distVersion}
// @namespace      https://github.com/${repo}
// @updateURL      ${updateUrl}
// @downloadURL    ${downloadUrl}
// @description    Use smoothed, heading-up, IITC user-location follow movement.
// @author         Mike Diehn and Frank
// @match          https://intel.ingress.com/*
// @match          https://*.ingress.com/intel*
// @grant          none
// ==/UserScript==`;

const output = `${metadata}

(function () {
  function wrapper(plugin_info) {
    ${source}
  }

  const script = document.createElement('script');
  const info = {};

  if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
    info.script = {
      version: GM_info.script.version,
      name: GM_info.script.name,
      description: GM_info.script.description,
    };
  }

  script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
  (document.body || document.head || document.documentElement).appendChild(script);
})();
`;

fs.writeFileSync(outPath, output, 'utf8');
fs.writeFileSync(metaPath, metadata + '\n', 'utf8');
updateReadmeInstallLinks();

console.log(`Wrote ${path.relative(root, outPath)}`);
console.log(`Wrote ${path.relative(root, metaPath)}`);
console.log(`Version ${distVersion}`);
