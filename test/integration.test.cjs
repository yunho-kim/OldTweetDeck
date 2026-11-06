const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { entry, timeline } = require('./fixtures.cjs');

function runtime() {
    const sent = [];
    class XHR {
        constructor() { this.readyState = 0; this.status = 200; this.responseText = ''; this.headers = {}; }
        open(method, url) { this.method = method; this.url = url; this.readyState = 1; }
        setRequestHeader(name, value) { this.headers[name] = value; }
        send(body) { sent.push({ method: this.method, url: this.url, headers: this.headers, body }); }
        getResponseHeader() { return null; }
        getAllResponseHeaders() { return ''; }
    }
    const context = vm.createContext({
        console: { log() {}, warn() {}, error() {} }, localStorage: {}, location: { hostname: 'x.com' },
        navigator: { language: 'en-US' }, document: { cookie: '' },
        XMLHttpRequest: XHR, URL, URLSearchParams, setTimeout, clearTimeout,
        TD: { storage: { accountController: { getAll: () => [{ state: { username: 'fixture', userId: '123' } }], getUserIdentifier: () => 'fixture' } } },
    });
    context.window = context;
    context.solveChallenge = async () => 'fixture-only';
    for (const file of ['for-you.js', 'interception.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
    // No user session or network is used by this integration test.
    return { context, sent };
}

test('full XHR interceptor sends recommendation POST and parses it with the production tweet parser', async () => {
    const { context, sent } = runtime();
    const xhr = new context.XMLHttpRequest();
    xhr.open('GET', 'https://api.x.com/1.1/statuses/for_you_timeline.json?count=40');
    xhr.setRequestHeader('x-act-as-user-id', '123');
    await xhr.send();
    assert.equal(sent[0].method, 'POST');
    assert.equal(JSON.parse(sent[0].body).queryId, context.OTDForYou.QUERY_ID);
    xhr.responseText = JSON.stringify(timeline([entry('100', '200'), entry('999', '199')]));
    const result = JSON.parse(xhr.responseText);
    assert.ok(Array.isArray(result));
    assert.deepEqual(result.map(t => t.id_str), ['100', '999']);
    assert.equal(result[0].receiveTime, '200000');
});

test('original Home remains GET HomeLatestTimeline and its existing chronological processing works', async () => {
    const { context, sent } = runtime();
    const xhr = new context.XMLHttpRequest();
    xhr.open('GET', 'https://api.x.com/1.1/statuses/home_timeline.json?count=40');
    xhr.setRequestHeader('x-act-as-user-id', '123');
    await xhr.send();
    assert.equal(sent[0].method, 'GET');
    assert.match(sent[0].url, /\/HomeLatestTimeline\?/);
    xhr.responseText = JSON.stringify(timeline([entry('100', '200')]));
    const result = JSON.parse(xhr.responseText);
    assert.equal(result[0].id_str, '100');
    assert.equal(result[0].receiveTime, undefined);
});
