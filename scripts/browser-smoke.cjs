// Optional: npm install --no-save playwright, then npm run test:browser.
// Uses a fresh browser profile and intercepted fixture data. No X login/network.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { entry, timeline, tweet } = require('../test/fixtures.cjs');
const root = path.resolve(__dirname, '..');

(async () => {
    const browser = await chromium.launch({ channel: process.env.OTD_TEST_CHANNEL || 'msedge', headless: true });
    let page;
    const errors = [], requests = [];
    try {
        page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text().slice(0, 500)); });
        const viewer = { ...tweet('123').core.user_results.result.legacy, id_str: '123', id: 123, screen_name: 'fixture', name: 'Fixture account' };
        const html = fs.readFileSync(path.join(root, 'files/index.html'), 'utf8').replace('</body>', `
            <script>
            let cookie = { value: 'fixture-not-a-real-session' };
            if (!localStorage.OTDfeeds) localStorage.OTDfeeds = '{}';
            if (!localStorage.OTDcolumns) localStorage.OTDcolumns = '{}';
            if (!localStorage.OTDcolumnIds) localStorage.OTDcolumnIds = '[]';
            localStorage.OTDverifiedUser = ${JSON.stringify(JSON.stringify(viewer))};
            localStorage.twitterAccountID = '123';
            window.solveChallenge = async () => 'fixture-not-a-real-transaction';
            </script>
            <link rel="stylesheet" href="/fixture/files/bundle.css">
            <script src="/fixture/src/for-you.js"></script>
            <script src="/fixture/src/interception.js"></script>
            <script src="/fixture/files/vendor.js"></script>
            <script src="/fixture/files/twitter-text.js"></script>
            <script src="/fixture/files/bundle.js"></script>
            </body>`);
        await page.route('**/*', async route => {
            const req = route.request(), url = new URL(req.url());
            requests.push({ path: url.pathname, method: req.method() });
            if (url.pathname.startsWith('/fixture/')) {
                const file = path.resolve(root, url.pathname.slice('/fixture/'.length));
                if (!file.startsWith(root + path.sep)) return route.abort();
                if (url.pathname.endsWith('/files/bundle.js') && process.env.OTD_TEST_BASE_BUNDLE) {
                    return route.fulfill({ path: process.env.OTD_TEST_BASE_BUNDLE, contentType: 'application/javascript' });
                }
                return route.fulfill({ path: file, contentType: file.endsWith('.css') ? 'text/css' : 'application/javascript' });
            }
            if (url.pathname === '/i/tweetdeck') return route.fulfill({ contentType: 'text/html', body: html });
            let data = {};
            if (url.pathname.includes('verify_credentials')) data = viewer;
            else if (url.pathname.endsWith('/users/contributees.json')) data = [];
            else if (url.pathname.endsWith('/saved_searches/list.json') || url.pathname.endsWith('/friendships/no_retweets/ids.json')) data = [];
            else if (url.pathname.endsWith('/help/configuration.json')) data = { short_url_length: 23, short_url_length_https: 23, characters_reserved_per_media: 24, photo_size_limit: 5242880, max_media_per_upload: 4 };
            else if (url.pathname.endsWith('/lists/ownerships.json') || url.pathname.endsWith('/lists/subscriptions.json')) data = { lists: [], next_cursor_str: '0' };
            else if (url.pathname.endsWith('/search/typeahead.json')) data = { users: [], topics: [], events: [], oneclick: [], query: '' };
            else if (url.pathname.endsWith('/notifications/all.json')) data = { timeline: { instructions: [{ addEntries: { entries: [] } }] }, globalObjects: { tweets: {}, users: {}, notifications: {} } };
            else if (url.pathname.endsWith('/live_pipeline/events')) return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
            else if (url.pathname.endsWith('/HomeTimeline')) data = timeline([
                entry('1900000000000000010', '1900000000000000100', tweet('1900000000000000010', 'Recommended: testing LLM based software verification')),
                entry('1900000000000000099', '1900000000000000090', tweet('1900000000000000099', 'Recommended: reproducible evaluation and robust test oracles')),
            ]);
            else if (url.pathname.includes('/HomeLatestTimeline')) data = timeline([entry('1900000000000000100', '1900000000000000100')]);
            else if (url.pathname.endsWith('/account/settings.json')) data = { screen_name: 'fixture', language: 'en', time_zone: { name: 'UTC' } };
            else if (url.pathname.endsWith('/users/lookup.json')) data = [viewer];
            else if (url.pathname.includes('/friends/ids') || url.pathname.includes('/blocks/ids') || url.pathname.includes('/mutes/users/ids')) data = { ids: [], next_cursor_str: '0' };
            else if (/\.(png|gif|jpg|ico|woff2?)$/.test(url.pathname)) return route.fulfill({ status: 204, body: '' });
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
        });
        await page.goto('https://x.com/i/tweetdeck');
        await page.waitForFunction(() => window.TD?.controller?.columnManager, null, { timeout: 15000 });
        await page.waitForFunction(() => TD.storage.accountController.getAll().length > 0, null, { timeout: 15000 });
        await page.waitForFunction(() => TD.ready === true, null, { timeout: 15000 });
        if (process.env.OTD_TEST_BASE_BUNDLE) {
            console.log(JSON.stringify({ baseline: true, errors }, null, 2));
            return;
        }
        await page.locator('[data-action="add-column"]').first().click();
        await page.getByText('For You', { exact: true }).click();
        await page.waitForFunction(() => document.body.textContent.includes('Recommended: testing LLM'), null, { timeout: 15000 });
        await page.locator('.js-add-column').click();
        await page.evaluate(() => TD.components.OpenColumn.instance.destroy());
        const result = await page.evaluate(() => {
            const manager = TD.controller.columnManager;
            const columns = Object.values(manager._aColumnIndex);
            const column = columns.find(column => !column.temporary && column.getFeeds().some(feed => feed.getType() === 'foryou'));
            const home = columns.find(column => column.getFeeds().some(feed => feed.getType() === 'home'));
            for (const extra of columns) {
                if (extra !== column && extra !== home) manager.deleteColumn(extra.model.getKey());
            }
            return { menu: manager.DISPLAY_ORDER.find(item => item.type === 'foryou'),
                feeds: column.getFeeds().map(feed => ({ type: feed.getType(), account: feed.getAccountKey() })),
                homeFeeds: home.getFeeds().map(feed => feed.getType()) };
        });
        assert.equal(result.menu.title, 'For You');
        assert.equal(result.feeds[0].type, 'foryou');
        assert.deepEqual(result.homeFeeds, ['home']);
        await page.waitForFunction(() => document.body.textContent.includes('Recommended: testing LLM'), null, { timeout: 15000 });
        const order = await page.locator('body').innerText();
        assert.ok(order.indexOf('Recommended: testing') < order.indexOf('Recommended: reproducible'));
        await page.waitForFunction(() => Object.values(JSON.parse(localStorage.OTDfeeds || '{}')).some(feed => feed.type === 'foryou')
            && JSON.parse(localStorage.OTDcolumnIds || '[]').length > 0, null, { timeout: 10000 });
        await page.reload();
        await page.waitForFunction(() => TD.ready === true && document.body.textContent.includes('Recommended: testing LLM'), null, { timeout: 20000 });
        const restored = await page.evaluate(() => Object.values(TD.controller.columnManager._aColumnIndex)
            .some(column => column.getFeeds().some(feed => feed.getType() === 'foryou')));
        assert.equal(restored, true);
        await page.locator('.column').filter({ hasText: 'Recommended: testing LLM' }).first().screenshot({ path: process.env.OTD_TEST_SCREENSHOT || path.join(root, 'build', 'for-you-smoke.png') });
        assert.ok(requests.some(req => req.path.endsWith('/HomeTimeline') && req.method === 'POST'));
        // This old Beta-button React error is also reproduced with the unchanged
        // upstream bundle (OTD_TEST_BASE_BUNDLE); fail on any other browser error.
        assert.deepEqual(errors.filter(message => !message.startsWith('TypeError: Cannot call a class as a function')), []);
        console.log(JSON.stringify({ result, restored, errors, requestCount: requests.length, authenticatedLiveTest: false }, null, 2));
    } catch (error) {
        console.error(JSON.stringify({ errors, requests: requests.slice(-20),
            page: await page?.evaluate(() => ({ title: document.title, text: document.body.textContent.slice(0, 1000), td: Object.keys(window.TD || {}) })) }, null, 2));
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
