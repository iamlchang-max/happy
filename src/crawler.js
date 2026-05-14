export function normalizeText(value = '') {
  return decodeXml(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function googleNewsFeedForTopic(topic) {
  const query = encodeURIComponent(topic);
  return `https://news.google.com/rss/search?q=${query}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
}

export function itemMatchesTopic(item, topic) {
  const haystack = `${item.title || ''} ${item.contentSnippet || ''} ${item.content || ''}`.toLocaleLowerCase();
  return haystack.includes(topic.toLocaleLowerCase());
}

export function toNewsItem(item, topic, feedTitle) {
  const title = normalizeText(item.title || '未命名新聞');
  const link = item.link || item.guid || '';
  const summary = normalizeText(item.contentSnippet || item.content || item.summary || '');
  const publishedAt = item.isoDate || item.pubDate || new Date().toISOString();

  return {
    id: `${topic}:${link || title}`,
    topic,
    title,
    link,
    source: feedTitle || item.creator || 'RSS',
    publishedAt,
    summary
  };
}

export function mergeNews(existingItems, incomingItems) {
  const seen = new Set();
  return [...incomingItems, ...existingItems]
    .filter((item) => {
      const key = `${item.topic}|${item.link || item.title}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

function decodeXml(value = '') {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function firstTagValue(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match ? normalizeText(match[1]) : '';
}

function tagValue(xml, tagNames) {
  for (const tagName of tagNames) {
    const value = firstTagValue(xml, tagName);
    if (value) {
      return value;
    }
  }

  return '';
}

function extractLink(block) {
  const atomLink = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);
  if (atomLink) {
    return decodeXml(atomLink[1]);
  }

  return tagValue(block, ['link']);
}

function normalizeDate(value) {
  if (!value) {
    return '';
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? '' : new Date(timestamp).toISOString();
}

function parseRss(xml) {
  const feedTitle = firstTagValue(xml, 'title') || 'RSS';
  const itemBlocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  const entryBlocks = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map((match) => match[1]);
  const blocks = itemBlocks.length > 0 ? itemBlocks : entryBlocks;

  return {
    title: feedTitle,
    items: blocks.map((block) => ({
      title: tagValue(block, ['title']),
      link: extractLink(block),
      guid: tagValue(block, ['guid', 'id']),
      contentSnippet: tagValue(block, ['description', 'summary', 'content:encoded', 'content']),
      pubDate: tagValue(block, ['pubDate', 'updated', 'published']),
      isoDate: normalizeDate(tagValue(block, ['pubDate', 'updated', 'published'])),
      creator: tagValue(block, ['dc:creator', 'author'])
    }))
  };
}

async function fetchFeed(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'DailyNewsRadar/0.1'
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}`);
  }

  return parseRss(await response.text());
}

export async function crawlTopic(topic, extraFeeds = [], maxItems = 25) {
  const feedUrls = [googleNewsFeedForTopic(topic), ...extraFeeds];
  const results = await Promise.allSettled(feedUrls.map((url) => fetchFeed(url)));
  const items = [];
  const errors = [];

  for (const [index, result] of results.entries()) {
    const feedUrl = feedUrls[index];
    if (result.status === 'rejected') {
      errors.push({ feedUrl, message: result.reason.message });
      continue;
    }

    const feed = result.value;
    for (const item of feed.items || []) {
      if (feedUrl === feedUrls[0] || itemMatchesTopic(item, topic)) {
        items.push(toNewsItem(item, topic, feed.title));
      }
    }
  }

  return {
    topic,
    items: items.slice(0, maxItems),
    errors
  };
}

export async function crawlTopics({ topics, extraFeeds, maxItemsPerTopic, existingItems = [] }) {
  const crawled = await Promise.all(
    topics.map((topic) => crawlTopic(topic, extraFeeds, maxItemsPerTopic))
  );
  const incomingItems = crawled.flatMap((result) => result.items);

  return {
    items: mergeNews(existingItems, incomingItems),
    report: {
      crawledAt: new Date().toISOString(),
      topics: crawled.map((result) => ({
        topic: result.topic,
        count: result.items.length,
        errors: result.errors
      }))
    }
  };
}
