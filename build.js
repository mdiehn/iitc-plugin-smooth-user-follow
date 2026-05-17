#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = __dirname;
const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
const srcPath = path.join(root, 'src', 'smooth-user-follow.js');
const distDir = path.join(root, 'dist');
const outPath = path.join(distDir, 'smooth-user-follow.user.js');
const metaPath = path.join(distDir, 'smooth-user-follow.meta.js');
const updateUrl = 'http://localhost:8000/dist/smooth-user-follow.meta.js';
const downloadUrl = 'http://localhost:8000/dist/smooth-user-follow.user.js';

const buildTime = new Date().toISOString();
const source = fs.readFileSync(srcPath, 'utf8')
  .replaceAll('__PLUGIN_VERSION__', version)
  .replaceAll('__BUILD_TIME__', buildTime);

const metadata = `// ==UserScript==
// @id             iitc-plugin-smooth-user-follow
// @name           IITC plugin: Smooth User Follow
// @category       Controls
// @version        ${version}
// @namespace      https://github.com/mdiehn/iitc-smooth-user-follow
// @updateURL      ${updateUrl}
// @downloadURL    ${downloadUrl}
// @description    Use steady-camera IITC user-location follow movement, with a desktop movement simulator.
// @author         Mike Diehn and Frank
// @match          https://intel.ingress.com/*
// @match          https://*.ingress.com/intel*
// @grant          none
// ==/UserScript==`;

const wrapped = `${metadata}

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

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(outPath, wrapped);
fs.writeFileSync(metaPath, metadata + '\n');

console.log(`Built ${path.relative(root, outPath)}`);
console.log(`Built ${path.relative(root, metaPath)}`);
