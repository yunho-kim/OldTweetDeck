const test = require('node:test');
const assert = require('node:assert/strict');
const adapter = require('../src/for-you.js');
const { tweet, entry, timeline } = require('./fixtures.cjs');
const parse = result => ({ ...result.legacy, user: result.core?.user_results.result.legacy });

test('retains recommendation ranking instead of sorting by tweet ID or date', () => {
    const data = timeline([entry('10', '1900000000000000001'), entry('999', '1900000000000000000')]);
    const result = adapter.parseTimeline(data, parse);
    assert.deepEqual(result.map(t => t.id_str), ['10', '999']);
    assert.equal(result[0].receiveTime, '1900000000000000001000');
    assert.equal(result[0].otdForYouCursor, 'opaque-top-cursor==');
    assert.equal(result[1].otdForYouCursor, 'opaque-bottom-cursor==');
    assert.equal(data.data.home.home_timeline_urt.instructions[0].entries[0].content.itemContent.tweet_results.result.legacy.receiveTime, undefined);
});

test('expands conversation modules, deduplicates and filters ads/blocked/muted/unavailable posts', () => {
    const promoted = entry('ad', '999'); promoted.content.itemContent.promotedMetadata = {};
    const result = adapter.parseTimeline(timeline([
        entry('10', '100'), promoted, entry('blocked', '99', tweet('blocked', 'blocked', { blocking: true })),
        entry('muted', '98', tweet('muted', 'muted', { muting: true })),
        entry('gone', '97', { __typename: 'TweetUnavailable' }),
        { entryId: 'home-conversation-1', sortIndex: '90', content: { items: [
            { entryId: 'conversation-tweet-10', item: { itemContent: { tweet_results: { result: tweet('10') } } } },
            { entryId: 'conversation-tweet-20', item: { itemContent: { tweet_results: { result: tweet('20') } } } },
        ] } },
    ]), parse);
    assert.deepEqual(result.map(t => t.id_str), ['10', '20']);
    assert.equal(result[1].receiveTime, '89999');
});

test('merges all add-entry batches and replacement entries', () => {
    const data = timeline([entry('1', '3')]);
    data.data.home.home_timeline_urt.instructions.push({ type: 'TimelineAddEntries', entries: [entry('2', '2')] });
    data.data.home.home_timeline_urt.instructions.push({ type: 'TimelineReplaceEntry', entry: entry('3', '1') });
    assert.deepEqual(adapter.parseTimeline(data, parse).map(t => t.id_str), ['1', '2', '3']);
});

test('returns API errors and malformed-response errors instead of a false empty success', () => {
    assert.deepEqual(adapter.parseTimeline({ errors: [{ code: 88, message: 'Rate limit exceeded' }] }, parse).errors[0].code, 88);
    assert.match(adapter.parseTimeline({}, parse).errors[0].message, /unrecognized/);
    assert.deepEqual(adapter.parseTimeline(timeline([]), parse), []);
});

test('sends POST HomeTimeline, passes opaque cursor and isolates late-bound account history', () => {
    const route = adapter.createRoute({ apiBase: 'https://x.com/i/api/graphql', parseTweet: parse,
        getCurrentUserId: () => 'owner', setHeaders: () => {} });
    function request(account, cursor) {
        const xhr = { modUrl: 'https://api.x.com' + adapter.PATH + '?count=40' + (cursor ? '&max_id=' + encodeURIComponent(cursor) : ''), modReqHeaders: {}, storage: {} };
        route.beforeRequest(xhr);
        xhr.modReqHeaders['X-Act-As-User-Id'] = account;
        route.beforeSendHeaders(xhr);
        return xhr;
    }
    const a = request('A');
    assert.equal(a.modMethod, 'POST'); assert.match(a.modUrl, /\/HomeTimeline$/);
    a.responseText = JSON.stringify(timeline([entry('1', '10')])); route.afterRequest(a);
    const b = request('B', 'cursor+/with==encoding');
    assert.deepEqual(JSON.parse(route.beforeSendBody(b)).variables.seenTweetIds, []);
    assert.equal(JSON.parse(route.beforeSendBody(b)).variables.cursor, 'cursor+/with==encoding');
    const again = request('A');
    assert.deepEqual(JSON.parse(route.beforeSendBody(again)).variables.seenTweetIds, ['1']);
    assert.equal('cursor' in JSON.parse(route.beforeSendBody(again)).variables, false);
    assert.equal(a.storage.forYouAccount, 'A');
});

test('keeps bottom cursor on one-post pages and native sort/cursor fields on processed models', () => {
    const raw = adapter.parseTimeline(timeline([entry('1', '9007199254740993')]), parse);
    const native = adapter.processTimeline(raw, { processTweet: t => ({ id: t.id_str, sortIndex: { type: 'numericString', value: t.receiveTime } }) });
    assert.equal(native[0].cursor, 'opaque-bottom-cursor==');
    assert.equal(native[0].sortIndex.value, '9007199254740993000');
});

test('retains pagination when a boundary post cannot be rendered by the native client', () => {
    const data = adapter.parseTimeline(timeline([entry('1', '100'), entry('2', '99')]), parse);
    const result = adapter.processTimeline(data, { processTweet: t => t.id_str === '2' ? null : { id: t.id_str } });
    assert.equal(result.length, 1);
    assert.equal(result[0].cursor, 'opaque-bottom-cursor==');
});
