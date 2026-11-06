// Package only runtime files; tests and development data never enter the add-on.
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const root = path.resolve(__dirname, '..');
const buildRoot = path.join(root, 'build');
fs.mkdirSync(buildRoot, { recursive: true });
const stage = fs.mkdtempSync(path.join(buildRoot, 'package-'));
const runtimeFiles = ['images', 'files', 'src', 'solver.html', 'manifest.json', 'ruleset.json', 'LICENSE'];
try {
    for (const name of runtimeFiles) {
        const source = path.join(root, name);
        if (fs.existsSync(source)) fs.cpSync(source, path.join(stage, name), { recursive: true });
    }
    const chrome = new AdmZip();
    chrome.addLocalFolder(stage);
    chrome.writeZip(path.join(buildRoot, 'OldTweetDeckForYouChrome.zip'));
    const manifest = JSON.parse(fs.readFileSync(path.join(stage, 'manifest.json'), 'utf8'));
    manifest.browser_specific_settings = { gecko: { id: 'oldtweetdeck-foryou@yunho-kim', strict_min_version: '90.0' } };
    manifest.manifest_version = 2;
    manifest.permissions.push('webRequest', 'webRequestBlocking', ...manifest.host_permissions,
        'https://tweetdeck.dimden.dev/*', 'https://raw.githubusercontent.com/*');
    delete manifest.host_permissions;
    delete manifest.declarative_net_request;
    for (const script of manifest.content_scripts) {
        delete script.world;
        script.js = script.js.filter(name => name !== 'src/destroyer.js');
    }
    manifest.background = { scripts: ['src/background.js'] };
    manifest.web_accessible_resources = manifest.web_accessible_resources[0].resources;
    fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2));
    const firefox = new AdmZip();
    firefox.addLocalFolder(stage);
    firefox.writeZip(path.join(buildRoot, 'OldTweetDeckForYouFirefox.zip'));
    console.log('Built Chromium and Firefox For You packages.');
} finally {
    const relative = path.relative(fs.realpathSync(buildRoot), fs.realpathSync(stage));
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('Refusing to remove staging directory outside build');
    }
    fs.rmSync(stage, { recursive: true });
}
