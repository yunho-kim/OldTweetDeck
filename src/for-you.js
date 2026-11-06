/* Experimental For You feed adapter. Kept separate from TweetDeck's bundled UI. */
(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.OTDForYou = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
    "use strict";

    // Same HomeTimeline operation used by dimdenGD/OldTwitter's getAlgorithmicalV2.
    // This is an undocumented X operation and can change independently of this fork.
    const QUERY_ID = "k3YiLNE_MAy5J-NANLERdg";
    const PATH = "/1.1/statuses/for_you_timeline.json";
    const features = {
        responsive_web_graphql_exclude_directive_enabled: true,
        rweb_video_screen_enabled: false,
        profile_label_improvements_pcf_label_in_post_enabled: true,
        responsive_web_profile_redirect_enabled: false,
        rweb_tipjar_consumption_enabled: true,
        verified_phone_label_enabled: false,
        creator_subscriptions_tweet_preview_api_enabled: true,
        responsive_web_graphql_timeline_navigation_enabled: true,
        responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
        premium_content_api_read_enabled: false,
        communities_web_enable_tweet_community_results_fetch: true,
        c9s_tweet_anatomy_moderator_badge_enabled: true,
        tweetypie_unmention_optimization_enabled: true,
        responsive_web_grok_analyze_button_fetch_trends_enabled: false,
        responsive_web_grok_analyze_post_followups_enabled: true,
        responsive_web_jetfuel_frame: true,
        responsive_web_grok_share_attachment_enabled: true,
        articles_preview_enabled: true,
        responsive_web_edit_tweet_api_enabled: true,
        graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
        view_counts_everywhere_api_enabled: true,
        longform_notetweets_consumption_enabled: true,
        responsive_web_twitter_article_tweet_consumption_enabled: true,
        tweet_awards_web_tipping_enabled: false,
        responsive_web_grok_show_grok_translated_post: false,
        responsive_web_grok_analysis_button_from_backend: true,
        creator_subscriptions_quote_tweet_preview_enabled: false,
        freedom_of_speech_not_reach_fetch_enabled: true,
        standardized_nudges_misinfo: true,
        tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
        rweb_video_timestamps_enabled: true,
        longform_notetweets_rich_text_read_enabled: true,
        longform_notetweets_inline_media_enabled: true,
        responsive_web_grok_image_annotation_enabled: true,
        responsive_web_grok_imagine_annotation_enabled: true,
        responsive_web_grok_community_note_auto_translation_is_enabled: false,
        responsive_web_enhance_cards_enabled: false,
    };

    function error(message) {
        return { errors: [{ code: 131, message: "For You: " + message }] };
    }

    function parseTimeline(data, parseTweet) {
        const timeline = data?.data?.home?.home_timeline_urt;
        if (!Array.isArray(timeline?.instructions)) {
            return data?.errors?.length ? { errors: data.errors } : error("unrecognized timeline response");
        }
        const entries = [];
        for (const instruction of timeline.instructions) {
            if (Array.isArray(instruction.entries)) entries.push(...instruction.entries);
            if (instruction.entry) entries.push(instruction.entry);
        }
        let top, bottom;
        const tweets = [], ids = new Set();
        for (let index = 0; index < entries.length; index++) {
            const entry = entries[index];
            const content = entry.content || {};
            if (content.cursorType === "Top") top = content.value;
            if (content.cursorType === "Bottom") bottom = content.value;
            if (/cursor-top-/.test(entry.entryId || "")) top = content.value;
            if (/cursor-bottom-/.test(entry.entryId || "")) bottom = content.value;
            if (/promoted/i.test(entry.entryId || "") || content.promotedMetadata) continue;
            const items = content.items || [{ item: content, entryId: entry.entryId }];
            for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
                const wrapper = items[itemIndex];
                const item = wrapper.item?.itemContent || wrapper.itemContent || wrapper.item;
                if (!item || item.promotedMetadata || /promoted/i.test(wrapper.entryId || "")) continue;
                const result = item.tweet_results?.result;
                if (!result) continue; // Suggestions, prompts and unavailable posts are not tweets.
                let tweet;
                try { tweet = parseTweet(result); } catch (_) { continue; }
                if (!tweet?.id_str || tweet.user?.blocking || tweet.user?.muting || ids.has(tweet.id_str)) continue;
                if (/Twitter for Advertisers|advertiser-interface/.test(tweet.source || "")) continue;
                ids.add(tweet.id_str);
                // Never coerce X's 64-bit ranking values through a JavaScript Number.
                const rank = /^\d+$/.test(String(entry.sortIndex))
                    ? BigInt(entry.sortIndex) : (BigInt(Date.now()) << 22n) - BigInt(index);
                tweets.push({ ...tweet, receiveTime: String(rank * 1000n - BigInt(itemIndex)) });
            }
        }
        tweets.sort((a, b) => BigInt(a.receiveTime) > BigInt(b.receiveTime) ? -1 : BigInt(a.receiveTime) < BigInt(b.receiveTime) ? 1 : 0);
        if (tweets.length) {
            tweets[0].otdForYouCursor = top;
            // The bottom boundary is needed even for a one-post response.
            tweets[tweets.length - 1].otdForYouCursor = bottom;
        }
        return tweets;
    }

    function processTimeline(data, client) {
        if (!Array.isArray(data)) return [];
        const tweets = [];
        for (const raw of data) {
            const tweet = client.processTweet(raw);
            if (tweet) {
                tweet.cursor = raw.otdForYouCursor;
                tweets.push(tweet);
            }
        }
        if (tweets.length) {
            tweets[0].cursor = data[0]?.otdForYouCursor;
            tweets[tweets.length - 1].cursor = data[data.length - 1]?.otdForYouCursor;
        }
        return tweets;
    }

    function createRoute({ apiBase, parseTweet, getCurrentUserId, setHeaders, getQueryId = () => QUERY_ID }) {
        const seenByAccount = new Map();
        return {
            path: PATH,
            method: "GET",
            beforeRequest(xhr) {
                const params = new URL(xhr.modUrl).searchParams;
                const account = Object.entries(xhr.modReqHeaders).find(([key]) => key.toLowerCase() === "x-act-as-user-id")?.[1]
                    || params.get("user_id") || getCurrentUserId();
                xhr.storage.forYouAccount = String(account);
                const variables = {
                    count: Math.min(100, Math.max(1, Number(params.get("count")) || 40)),
                    includePromotedContent: true,
                    latestControlAvailable: true,
                    requestContext: "launch",
                    withCommunity: true,
                    seenTweetIds: seenByAccount.get(String(account)) || [],
                };
                if (params.get("max_id")) variables.cursor = params.get("max_id");
                const queryId = getQueryId();
                xhr.modMethod = "POST";
                xhr.modUrl = `${apiBase}/${encodeURIComponent(queryId)}/HomeTimeline`;
                xhr.storage.forYouBody = JSON.stringify({ variables, features, queryId });
            },
            beforeSendHeaders(xhr) {
                setHeaders(xhr);
                // TwitterClient adds account headers after open()/before send().
                // Resolve the account here, not just in beforeRequest().
                const account = Object.entries(xhr.modReqHeaders).find(([key]) => key.toLowerCase() === "x-act-as-user-id")?.[1]
                    || xhr.storage.forYouAccount;
                xhr.storage.forYouAccount = String(account);
                const body = JSON.parse(xhr.storage.forYouBody);
                body.variables.seenTweetIds = seenByAccount.get(String(account)) || [];
                xhr.storage.forYouBody = JSON.stringify(body);
            },
            beforeSendBody(xhr) { return xhr.storage.forYouBody; },
            afterRequest(xhr) {
                if (xhr.storage.forYouData) return xhr.storage.forYouData;
                let data;
                try { data = JSON.parse(xhr.responseText); }
                catch (_) { return error("invalid JSON response"); }
                const tweets = parseTimeline(data, parseTweet);
                if (Array.isArray(tweets)) {
                    const previous = seenByAccount.get(xhr.storage.forYouAccount) || [];
                    seenByAccount.set(xhr.storage.forYouAccount, [...new Set([...tweets.map(t => t.id_str), ...previous])].slice(0, 100));
                }
                xhr.storage.forYouData = tweets;
                return tweets;
            },
        };
    }

    return { PATH, QUERY_ID, createRoute, parseTimeline, processTimeline };
});
