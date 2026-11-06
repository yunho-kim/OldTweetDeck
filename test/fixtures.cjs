function tweet(id, text = `Recommended post ${id}`, user = {}) {
    return {
        __typename: "Tweet",
        rest_id: id,
        source: "web",
        core: { user_results: { result: {
            __typename: "User", rest_id: "42",
            legacy: { id_str: "42", name: "Demo researcher", screen_name: "demo_researcher",
                profile_image_url_https: "https://example.invalid/avatar.png", created_at: "Mon Jan 01 00:00:00 +0000 2024",
                description: "Fixture account", followers_count: 100, friends_count: 20, statuses_count: 50,
                favourites_count: 5, listed_count: 0, entities: {}, ...user },
        } } },
        legacy: { id_str: id, user_id_str: "42", full_text: text, text,
            created_at: "Mon Jan 01 00:00:00 +0000 2024", conversation_id_str: id,
            favorite_count: 5, retweet_count: 1, reply_count: 0, quote_count: 0,
            favorited: false, retweeted: false, lang: "en", entities: { hashtags: [], urls: [], user_mentions: [], symbols: [] } },
    };
}
function entry(id, rank, result = tweet(id)) {
    return { entryId: `tweet-${id}`, sortIndex: rank, content: { itemContent: { tweet_results: { result } } } };
}
function timeline(entries, bottom = "opaque-bottom-cursor==", top = "opaque-top-cursor==") {
    return { data: { home: { home_timeline_urt: { instructions: [
        { type: "TimelineAddEntries", entries: [
            ...entries,
            { entryId: "cursor-top-0", content: { cursorType: "Top", value: top } },
            { entryId: "cursor-bottom-0", content: { cursorType: "Bottom", value: bottom } },
        ] },
    ] } } } };
}
module.exports = { tweet, entry, timeline };
