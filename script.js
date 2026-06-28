// XHamster Grayjay Plugin
// script.js

const PLATFORM = "XHamster";
const BASE_URL = "https://xhamster.com";
const API_URL = "https://api.xhamster.com";

// Required: Plugin metadata object
const source = {
    name: PLATFORM,
    version: "1.0.0",
    
    // Required: Get home content
    getHome: function() {
        return getContent({
            url: BASE_URL + "/videos/new",
            type: "new"
        });
    },
    
    // Required: Search functionality
    search: function(query, type, order, filters) {
        const searchUrl = BASE_URL + "/search/" + encodeURIComponent(query);
        return getContent({
            url: searchUrl,
            type: "search"
        });
    },
    
    // Required: Get video details and sources
    getVideoDetails: function(url) {
        return fetchVideoDetails(url);
    },
    
    // Optional: Get content by URL
    getContent: function(url, type) {
        return getContent({
            url: url,
            type: type || "browse"
        });
    },
    
    // Optional: Check if URL is a channel/user
    isChannelUrl: function(url) {
        return url.includes("/users/") || url.includes("/channels/");
    },
    
    // Optional: Get channel content
    getChannel: function(url) {
        return getContent({
            url: url,
            type: "channel"
        });
    }
};

// Helper: Fetch and parse video listings
function getContent(options) {
    const res = http.GET(options.url, {}, true);
    
    if (!res.isOk) {
        throw new Error("Failed to fetch content: " + res.status);
    }
    
    const html = res.body;
    const videos = [];
    const pager = { hasMore: false, nextPage: null };
    
    // Parse video items from HTML
    // XHamster uses various class names for video items
    const videoRegex = /<a[^>]*href="(\/videos\/[^"]+)"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*>[\s\S]*?<div[^>]*class="[^"]*video-thumb-info[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<\/a>/g;
    
    // Alternative pattern for different XHamster layouts
    const videoRegex2 = /"videoId":\s*(\d+)[\s\S]*?"title":\s*"([^"]+)"[\s\S]*?"thumb":\s*"([^"]+)"[\s\S]*?"link":\s*"([^"]+)"/g;
    
    let match;
    let count = 0;
    
    // Try JSON-LD or embedded data first
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (jsonLdMatch) {
        try {
            const jsonData = JSON.parse(jsonLdMatch[1]);
            if (jsonData.itemListElement) {
                jsonData.itemListElement.forEach(item => {
                    if (item.item && videos.length < 20) {
                        videos.push(new PlatformVideo({
                            id: extractVideoId(item.item.url),
                            name: item.item.name,
                            thumbnails: new Thumbnails([new Thumbnail(item.item.thumbnail, 0)]),
                            author: new PlatformAuthorLink(
                                new PlatformID(PLATFORM, "xhamster", undefined),
                                "XHamster",
                                BASE_URL,
                                ""
                            ),
                            datetime: Date.now(),
                            url: item.item.url.startsWith("http") ? item.item.url : BASE_URL + item.item.url,
                            duration: 0
                        }));
                    }
                });
            }
        } catch (e) {}
    }
    
    // Parse HTML for video items
    const thumbRegex = /<div[^>]*class="[^"]*thumb-list__item[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*title="([^"]*)"[\s\S]*?<img[^>]*src="([^"]*)"[^>]*>[\s\S]*?<span[^>]*class="[^"]*thumb-image-container__duration[^"]*"[^>]*>([^<]*)<\/span>[\s\S]*?<\/div>/g;
    
    while ((match = thumbRegex.exec(html)) !== null && videos.length < 20) {
        const url = match[1].startsWith("http") ? match[1] : BASE_URL + match[1];
        const title = match[2].trim();
        const thumbnail = match[3];
        const durationStr = match[4].trim();
        
        videos.push(new PlatformVideo({
            id: extractVideoId(url),
            name: title,
            thumbnails: new Thumbnails([new Thumbnail(thumbnail, 0)]),
            author: new PlatformAuthorLink(
                new PlatformID(PLATFORM, "xhamster", undefined),
                "XHamster",
                BASE_URL,
                ""
            ),
            datetime: Date.now(),
            url: url,
            duration: parseDuration(durationStr)
        }));
        count++;
    }
    
    // Check for next page
    const nextPageMatch = html.match(/<a[^>]*class="[^"]*next[^"]*"[^>]*href="([^"]+)"/);
    if (nextPageMatch) {
        pager.hasMore = true;
        pager.nextPage = nextPageMatch[1].startsWith("http") ? nextPageMatch[1] : BASE_URL + nextPageMatch[1];
    }
    
    return new PlatformVideoPager(videos, pager.hasMore, pager.nextPage);
}

// Helper: Fetch individual video details
function fetchVideoDetails(url) {
    const res = http.GET(url, {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0"
    }, true);
    
    if (!res.isOk) {
        throw new Error("Failed to fetch video details: " + res.status);
    }
    
    const html = res.body;
    
    // Extract video metadata
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
    const title = titleMatch ? titleMatch[1].trim() : "Unknown";
    
    // Extract video sources from player configuration
    const sourcesMatch = html.match(/"sources":\s*(\{[^}]*\})/);
    const sources = [];
    
    if (sourcesMatch) {
        try {
            const sourcesData = JSON.parse(sourcesMatch[1]);
            Object.keys(sourcesData).forEach(quality => {
                if (typeof sourcesData[quality] === 'string' && sourcesData[quality].startsWith('http')) {
                    sources.push({
                        quality: quality,
                        url: sourcesData[quality]
                    });
                }
            });
        } catch (e) {}
    }
    
    // Alternative: Extract from video element
    const videoMatch = html.match(/<video[^>]*>[\s\S]*?<source[^>]*src="([^"]+)"[^>]*>/);
    if (videoMatch && sources.length === 0) {
        sources.push({
            quality: "auto",
            url: videoMatch[1]
        });
    }
    
    // Extract thumbnail
    const thumbMatch = html.match(/property="og:image"[^>]*content="([^"]+)"/);
    const thumbnail = thumbMatch ? thumbMatch[1] : "";
    
    // Extract duration
    const durationMatch = html.match(/"duration":\s*"([^"]+)"/);
    const duration = durationMatch ? parseDuration(durationMatch[1]) : 0;
    
    // Extract author/uploader
    const authorMatch = html.match(/"author":\s*\{[^}]*"name":\s*"([^"]+)"/);
    const authorName = authorMatch ? authorMatch[1] : "Unknown";
    
    // Extract views
    const viewsMatch = html.match(/"interactionCount":\s*"(\d+)"/);
    const viewCount = viewsMatch ? parseInt(viewsMatch[1]) : 0;
    
    // Create video details object
    const videoDetails = new PlatformVideoDetails({
        id: extractVideoId(url),
        name: title,
        thumbnails: new Thumbnails([new Thumbnail(thumbnail, 0)]),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, authorName, undefined),
            authorName,
            BASE_URL,
            ""
        ),
        datetime: Date.now(),
        description: "",
        url: url,
        duration: duration,
        viewCount: viewCount,
        sources: sources.map(s => new VideoSource({
            quality: s.quality,
            bitrate: 0,
            duration: duration,
            url: s.url,
            container: "mp4"
        }))
    });
    
    return videoDetails;
}

// Helper: Extract video ID from URL
function extractVideoId(url) {
    const match = url.match(/\/videos\/([^\/\?#]+)/);
    return match ? match[1] : url;
}

// Helper: Parse duration string to seconds
function parseDuration(durationStr) {
    if (!durationStr) return 0;
    
    const parts = durationStr.split(':').reverse();
    let seconds = 0;
    
    if (parts[0]) seconds += parseInt(parts[0]);
    if (parts[1]) seconds += parseInt(parts[1]) * 60;
    if (parts[2]) seconds += parseInt(parts[2]) * 3600;
    
    return seconds;
}

// Helper: Make HTTP request
const http = {
    GET: function(url, headers, useProxy) {
        // Use Grayjay's built-in HTTP package
        return Http.GET(url, headers, useProxy);
    },
    POST: function(url, body, headers, useProxy) {
        return Http.POST(url, body, headers, useProxy);
    }
};

// Export the source object
source;
