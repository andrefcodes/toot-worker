/*

Toot-worker - a serverless application that automatically crossposts RSS feed content to Mastodon.
Copyright (C) 2025 Andre Franca

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>. * 

Repository: https://github.com/andrefcodes/toot-worker

This code runs on Cloudflare Workers. 
Learn more at https://developers.cloudflare.com/workers/
 
*/

// Constants
const LAST_POST_KEY = "last_post"; // Key to track the last published post in KV storage

// Main logic: Process the latest RSS feed
async function processLatestPosts(env) {
    const { RSS_FEED_URL } = env;

    try {
        console.log("Fetching all posts from RSS feed...");
        const posts = await fetchAllPosts(RSS_FEED_URL);

        if (!posts.length) {
            console.log("No posts available in the RSS feed.");
            return;
        }

        console.log("Checking for eligible posts...");
        await processPostsRecursively(posts, env);

        console.log("Done!");

    } catch (error) {
        console.error("Error processing RSS posts:", error);
    }
}

// Fetch RSS Feed and Parse Posts
async function fetchAllPosts(rssFeedUrl) {
    if (!isValidUrl(rssFeedUrl)) {
        throw new Error(`Invalid RSS feed URL: ${rssFeedUrl}`);
    }

    try {
        const response = await fetch(rssFeedUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch RSS feed: ${response.statusText}`);
        }

        // Get the RSS feed as text
        const rssText = await response.text();

        // Get all <item> blocks from the RSS XML.
        const items = extractElements(rssText, "item");

        // Map <description>, <link>, and <pubDate> items
        return items.map((item) => {
            const descriptionHtml = extractElementValue(item, "description") || "";
            const link = extractElementValue(item, "link") || "";
            const pubDate = extractElementValue(item, "pubDate") || "";
            const pubDateUTC = new Date(pubDate);

            // Convert HTML to plain text
            const description = convertHtmlToText(descriptionHtml);

            // Combine the plain-text description with the link to the original post
            // const fullDescription = `${description}\n\n${link}`;

            return { description: /* fullDescription */ description, link, pubDateUTC };
        });
    } catch (error) {
        console.error("Error fetching or parsing RSS feed:", error);
        throw error;
    }
}

// Process Posts Recursively
async function processPostsRecursively(posts, env) {
    const { TOOTWORKER_KV, MASTODON_INSTANCE, ACCESS_TOKEN, VISIBILITY } = env;

    // Filter posts that are within the last 30 minutes
    const nowUTC = new Date();
    const thirtyMinutesAgoUTC = new Date(nowUTC - 30 * 60 * 1000);

    for (const post of posts) {
        try {
            // Skip posts older than 30 minutes
            if (post.pubDateUTC < thirtyMinutesAgoUTC) {
                continue;
            }
            
            // Skip posts that have already been published
            if (await isPostAlreadyPublished(post.link, TOOTWORKER_KV)) {
                continue;
            }

            // Publish the post to Mastodon
            console.log(`Publishing post: ${post.link}`);
            await publishToMastodon(post.description, MASTODON_INSTANCE, ACCESS_TOKEN, VISIBILITY);

            // Mark the post as published
            await savePublishedPost(post.link, TOOTWORKER_KV);
            console.log(`Post published and saved successfully`);

        } catch (error) {
            console.error(`Error processing post`, error);
        }
    }
}

// Publish content to Mastodon
async function publishToMastodon(CONTENT, MASTODON_INSTANCE, ACCESS_TOKEN, VISIBILITY) {
    try {
        const response = await fetch(`${MASTODON_INSTANCE}/api/v1/statuses`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${ACCESS_TOKEN}`,
                "Content-Type": `application/json`,
                "User-Agent": `Toot-Worker/1.0 (+https://github.com/andrefcodes/toot-worker)`
            },
            body: JSON.stringify({
                status: `${CONTENT}`,
                visibility: `${VISIBILITY}`, // Use the visibility setting from the environment
                application: {
                    name: "Toot-Worker",
                    website: "https://github.com/andrefcodes/toot-worker"
                }
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Mastodon API Error: ${errorText}`);
        }

    } catch (error) {
        console.error("Error publishing to Mastodon:", error);
    }
}

// Utility Functions

//Check if a post has already been published.
async function isPostAlreadyPublished(link, kvNamespace) {
    try {
        const lastPublishedLink = await kvNamespace.get(LAST_POST_KEY);
        return lastPublishedLink === link;
    } catch (error) {
        console.error("Error checking if post has already been published:", error);
        return false;
    }
}

// Save the link of the latest published post to avoid duplicates.
async function savePublishedPost(link, kvNamespace) {
    try {
        await kvNamespace.put(LAST_POST_KEY, link);
    } catch (error) {
        console.error("Error saving the published post link:", error);
    }
}

// Validates the format of a URL.
function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

// Extracts gets all <item> blocks from the RSS XML.
function extractElements(xml, tagName) {
    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "gi");
    const matches = [];
    let match;
    while ((match = regex.exec(xml)) !== null) {
        matches.push(match[1]);
    }
    return matches;
}

// Extracts the content of a given <tag> (e.g., <description>, <link>, <pubDate>)
function extractElementValue(xml, tagName) {
    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "i");
    const match = xml.match(regex);
    return match ? match[1].trim() : null;
}

// HTML Conversion into plaintext
function convertHtmlToText(html) {
    const decodedHtml = decodeHtmlEntities(html);

    return decodedHtml
        .replace(/<\/?(?:p|div|br)[^>]*>/g, "\n") // Replace block elements with newlines
        .replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)") // Convert <a> to "[text](URL)"
        .replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]+)"[^>]*>/gi, "[$1]($2)") // Convert <img> to "[alt](URL)"
        .replace(/<[^>]+>/g, "") // Strip all other HTML tags
        .trim(); // Remove leading/trailing whitespace
}

// This function is used by convertHtmlToText to ensure special characters are displayed correctly.
function decodeHtmlEntities(str) {
    return str.replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&amp;/g, "&")
              .replace(/&quot;/g, "\"")
              .replace(/&#39;/g, "'")
              .replace(/&rsquo;/g, "’")  
              .replace(/&lsquo;/g, "‘") 
              .replace(/&ldquo;/g, "“") 
              .replace(/&rdquo;/g, "”")  
              .replace(/&mdash;/g, "—")  
              .replace(/&ndash;/g, "–")  
              .replace(/&copy;/g, "©") 
              .replace(/&reg;/g, "®") 
              .replace(/&euro;/g, "€")  
              .replace(/&pound;/g, "£")  
              .replace(/&yen;/g, "¥")
              .replace(/&times;/g, "×")
              .replace(/&divide;/g, "÷")
              .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))  // Decodes numeric character references
              .replace(/&#x([a-fA-F0-9]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16))); // Decodes hex character references
}

//Cron Event Handlers
addEventListener("scheduled", (event) => {
    event.waitUntil(
        processLatestPosts({
            RSS_FEED_URL: RSS_FEED_URL,
            MASTODON_INSTANCE: INSTANCE_URL,
            ACCESS_TOKEN: ACCESS_TOKEN,
            TOOTWORKER_KV: TOOTWORKER_KV,
            VISIBILITY: VISIBILITY,
        })
    );
});